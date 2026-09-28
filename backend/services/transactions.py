"""Serialize changes to one gathering before reading its roster or status."""
from flask import has_request_context, request
from models import db, Gathering


def gathering_query():
    query = Gathering.query
    if has_request_context() and request.method not in ('GET', 'HEAD', 'OPTIONS'):
        query = query.populate_existing().with_for_update(of=Gathering)
    return query


def load_gathering(gathering_id):
    return gathering_query().filter_by(id=gathering_id).first()
