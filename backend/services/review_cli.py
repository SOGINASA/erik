import csv
import json
from pathlib import Path
import click
from models import db, ReviewSubmission
from services.application_data import SOURCES, capture, record_decision
from services.review_export import export_rows, schema_manifest
from services.review_schema import KINDS


def register_review_commands(app):
    @app.cli.command('application-data-backfill')
    def backfill():
        """Index existing records as legacy, without inventing historical inputs."""
        count = 0
        for model, (kind, _, status_field, outcomes) in SOURCES.items():
            for row in model.query.order_by(model.id):
                if ReviewSubmission.query.filter_by(kind=kind, source_id=row.id).first():
                    continue
                capture(row, origin='legacy')
                outcome = outcomes.get(getattr(row, status_field))
                if outcome:
                    record_decision(row, outcome, actor_type='legacy_unknown')
                count += 1
        db.session.commit()
        click.echo(f'Indexed {count} legacy records; excluded from training by default.')

    @app.cli.command('export-application-data')
    @click.option('--output', type=click.Path(dir_okay=False), required=True)
    @click.option('--format', 'file_format', type=click.Choice(['jsonl', 'csv']), default='jsonl')
    @click.option('--kind', type=click.Choice(KINDS), default=None)
    @click.option('--training-only', is_flag=True)
    @click.option('--include-private-text', is_flag=True, help='Include text requiring manual de-identification; never includes documents/contact columns.')
    def export(output, file_format, kind, training_only, include_private_text):
        """Write ordered examples and a versioned manifest; refuse to overwrite files."""
        target = Path(output)
        manifest_path = target.with_name(target.name + '.manifest.json')
        if target.exists() or manifest_path.exists():
            raise click.ClickException('Output or manifest already exists; choose a new filename')
        try:
            examples = list(export_rows(app.config.get('APPLICATION_DATA_EXPORT_KEY', ''), kind=kind,
                                       training_only=training_only, include_text=include_private_text))
        except ValueError as exc:
            raise click.ClickException(str(exc)) from exc
        manifest = {**schema_manifest(), 'records': len(examples), 'trainingOnly': training_only,
                    'includesPrivateText': include_private_text, 'format': file_format,
                    'kindFilter': kind, 'featureColumns': sorted({key for row in examples for key in row['features']})}
        with target.open('x', encoding='utf-8', newline='') as stream:
            if file_format == 'jsonl':
                for row in examples:
                    stream.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + '\n')
            else:
                metadata = ['schemaVersion', 'formVersion', 'submissionKey', 'kind', 'caseGroup', 'applicantGroup',
                            'revision', 'submittedAt', 'origin', 'trainingEligible', 'exclusionReasons']
                labels = ['outcome', 'reasonCode', 'certainty', 'actorType', 'reviewerGroup', 'decidedAt', 'taxonomyVersion', 'reviewedRevision', 'checks']
                fields = metadata + [f'features.{key}' for key in manifest['featureColumns']] + [f'label.{key}' for key in labels]
                if include_private_text: fields += ['privateTextForDeidentification']
                writer = csv.DictWriter(stream, fieldnames=fields); writer.writeheader()
                for row in examples:
                    flat = {key: row[key] for key in metadata}
                    flat.update({f'features.{key}': value for key, value in row['features'].items()})
                    flat.update({f'label.{key}': value for key, value in (row['label'] or {}).items()})
                    if include_private_text: flat['privateTextForDeidentification'] = row['privateTextForDeidentification']
                    for key, value in list(flat.items()):
                        if isinstance(value, (list, dict)): flat[key] = json.dumps(value, ensure_ascii=False, sort_keys=True)
                        # Formula-injection defense for optional user-supplied text.
                        if isinstance(flat[key], str) and flat[key].startswith(('=', '+', '-', '@')): flat[key] = "'" + flat[key]
                    writer.writerow(flat)
        manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, sort_keys=True, indent=2) + '\n', encoding='utf-8')
        click.echo(f'Exported {len(examples)} records. Manifest: {manifest_path}')
