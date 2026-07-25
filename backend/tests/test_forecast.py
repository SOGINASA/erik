"""Прогноз явки: контракт ответа, выбор источника (модель/формула) и приватность.

Раньше эндпоинты /api/gatherings/* не были покрыты ни одним тестом — смену
источника прогноза можно было выкатить полностью зелёной сборкой. Эти тесты
фиксируют то, на что теперь смотрит весь UI.
"""
from datetime import datetime, timezone, timedelta

import pytest
from flask_jwt_extended import create_access_token

from models import (db, User, City, Theme, Gathering, GatheringCoordinator,
                    Participant, AttendanceRecord)


def _tok(u):
    return create_access_token(identity=str(u.id), additional_claims={
        'user_type': u.user_type, 'role': u.role, 'full_name': u.full_name})


def _h(u):
    return {'Authorization': 'Bearer ' + _tok(u), 'Content-Type': 'application/json'}


@pytest.fixture
def roster():
    """Сбор с ростером 6 «да» / 6 «может» / 2 «нет» и разной историей людей."""
    db.session.add(City(id='ast', name_ru='Астана', name_kz='Астана', map_x=1, map_y=1))
    db.session.add(Theme(id='eco', label_ru='Экология', label_kz='Экология',
                         tint='#fff', ink='#000'))
    owner = User(full_name='Координатор', role='coord', user_type='user',
                 is_active=True, device_id='d-own')
    stranger = User(full_name='Чужой', role='coord', user_type='user',
                    is_active=True, device_id='d-str')
    db.session.add_all([owner, stranger])
    db.session.commit()

    g = Gathering(code='FCT01', owner_id=owner.id, title_ru='Уборка парка', title_kz='Саябақ',
                  place_ru='Парк', place_kz='Саябақ', theme='eco', city_id='ast',
                  starts_at=datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(days=2),
                  needed=10, status='open', ctx=1.0, revision=1)
    db.session.add(g)
    db.session.commit()
    db.session.add(GatheringCoordinator(gathering_id=g.id, user_id=owner.id, role='owner'))

    plan = ['yes'] * 6 + ['maybe'] * 6 + ['no'] * 2
    for i, answer in enumerate(plan):
        total, came = (i % 5), max(0, (i % 5) - 1)
        u = User(full_name=f'Волонтёр {i}', role='vol', user_type='user', is_active=True,
                 device_id=f'd-v{i}', trust_total=total, trust_came=came,
                 interests=['eco'] if i % 2 == 0 else None)
        db.session.add(u)
        db.session.flush()
        db.session.add(Participant(gathering_id=g.id, user_id=u.id, name=u.full_name,
                                   answer=answer, hist_total_at_rsvp=total,
                                   hist_came_at_rsvp=came))
    db.session.commit()
    return {'owner': owner, 'stranger': stranger, 'gid': g.id, 'g': g}


def _clear_cache():
    from services.forecast import invalidate
    invalidate()


# ── контракт ответа ──

def test_forecast_contract(client, roster):
    _clear_cache()
    r = client.get(f'/api/gatherings/{roster["gid"]}/forecast', headers=_h(roster['owner']))
    assert r.status_code == 200
    f = r.get_json()

    # легаси-ключи, на которые уже завязаны потребители
    for key in ('E', 'sigma', 'lo', 'hi', 'counts', 'segments', 'ctx', 'needed', 'computed_at'):
        assert key in f, f'потерян ключ {key}'
    # новые ключи контракта
    for key in ('expected', 'source', 'model', 'fallbackReason', 'verdict', 'shortBy',
                'baseline', 'nudge', 'computedAt'):
        assert key in f, f'нет ключа {key}'

    assert f['source'] in ('model', 'formula')
    assert f['counts'] == {'yes': 6, 'maybe': 6, 'no': 2, 'total': 14}
    assert f['baseline']['confirmed'] == 6
    assert f['expected'] == f['E']
    assert f['lo'] <= f['E'] <= f['hi']
    assert f['verdict'] in ('enough', 'risky', 'short')


def test_segments_sum_to_expected(client, roster):
    """sum(segments.expected) == E при ЛЮБОМ источнике — иначе payload врёт сам себе."""
    _clear_cache()
    r = client.get(f'/api/gatherings/{roster["gid"]}/forecast', headers=_h(roster['owner']))
    f = r.get_json()
    assert abs(sum(s['expected'] for s in f['segments']) - f['E']) < 0.06


def test_forecast_is_not_the_confirmed_count(client, roster):
    """Прогноз не обязан и не должен совпадать со счётчиком подтвердивших.

    Это ровно та претензия, ради которой всё переделывалось: раньше «прогноз» в
    штабе считался как 0.62·yes + 0.24·maybe и на типичном раскладе давал ровно
    число «да».
    """
    _clear_cache()
    f = client.get(f'/api/gatherings/{roster["gid"]}/forecast',
                   headers=_h(roster['owner'])).get_json()
    # 6 «да» + 6 «может» + 2 «нет»: ожидание обязано учитывать сомневающихся
    assert f['E'] != f['baseline']['confirmed']
    maybe_seg = next(s for s in f['segments'] if s['answer'] == 'maybe')
    assert maybe_seg['expected'] > 0, 'сомневающиеся не должны выпадать из прогноза'


def test_forced_formula_source(client, roster):
    """?source=formula считает фолбэком — чтобы показать разницу на тех же данных."""
    _clear_cache()
    f = client.get(f'/api/gatherings/{roster["gid"]}/forecast?source=formula',
                   headers=_h(roster['owner'])).get_json()
    assert f['source'] == 'formula'
    assert f['model'] is None
    assert f['nudge'] == [], 'ранжировать сомневающихся умеет только модель'


def test_formula_fallback_when_model_down(client, roster, monkeypatch):
    """Модель упала → 200, source='formula', причина названа, число есть."""
    from services import attendance_ml
    _clear_cache()
    monkeypatch.setattr(attendance_ml, 'probabilities', lambda *a, **k: None)
    monkeypatch.setattr(attendance_ml, 'status', lambda: 'deps_missing')
    r = client.get(f'/api/gatherings/{roster["gid"]}/forecast', headers=_h(roster['owner']))
    assert r.status_code == 200
    f = r.get_json()
    assert f['source'] == 'formula'
    assert f['fallbackReason'] == 'deps_missing'
    assert f['E'] > 0


# ── доставка прогноза на экраны ──

def test_owner_view_carries_forecast_and_p(client, roster):
    """Прогноз и вероятности едут ВМЕСТЕ со сбором — фронт больше не считает сам."""
    _clear_cache()
    r = client.get(f'/api/gatherings/{roster["gid"]}', headers=_h(roster['owner']))
    assert r.status_code == 200
    g = r.get_json()['gathering']
    assert 'forecast' in g and g['forecast']['source'] in ('model', 'formula')
    assert g['counts']['total'] == 14
    assert all('p' in p for p in g['participants'])


def test_poll_carries_forecast(client, roster):
    _clear_cache()
    r = client.get(f'/api/gatherings/{roster["gid"]}/poll?since=-1', headers=_h(roster['owner']))
    assert r.status_code == 200
    body = r.get_json()
    assert 'forecast' in body and body['forecast']['E'] >= 0
    assert body['changed'], 'при устаревшей ревизии ростер должен приехать целиком'

    same = client.get(f'/api/gatherings/{roster["gid"]}/poll?since={body["revision"]}',
                      headers=_h(roster['owner'])).get_json()
    assert same['changed'] == [] and 'forecast' in same


def test_org_events_carry_forecast(client, roster):
    _clear_cache()
    r = client.get('/api/me/org/events', headers=_h(roster['owner']))
    assert r.status_code == 200
    events = r.get_json()['events']
    assert events, 'у координатора должен быть его сбор'
    f = events[0]['forecast']
    for key in ('expected', 'lo', 'hi', 'source', 'verdict', 'shortBy'):
        assert key in f


# ── приватность ──

def test_public_view_has_no_forecast(client, roster):
    """Гостю прогноз не показываем (решение против самосбывающегося пророчества)."""
    _clear_cache()
    g = db.session.get(Gathering, roster['gid'])
    r = client.get(f'/api/g/{g.code}')
    assert r.status_code == 200
    body = r.get_json()['gathering']
    assert 'forecast' not in body
    assert 'participants' not in body
    assert body['comingCount'] == 6


def test_forecast_is_owner_only(client, roster):
    _clear_cache()
    r = client.get(f'/api/gatherings/{roster["gid"]}/forecast', headers=_h(roster['stranger']))
    assert r.status_code in (403, 404)


# ── бэктест точности ──

def test_analytics_backtest_compares_three_predictors(client, roster):
    """MAE модели / формулы / наивного счётчика на завершённом сборе."""
    _clear_cache()
    g = db.session.get(Gathering, roster['gid'])
    # половина «да» реально пришла
    for i, p in enumerate(g.participants):
        if p.answer == 'yes' and i % 2 == 0:
            p.presence = 'came'
    db.session.commit()
    from services.forecast import finalize_gathering
    finalize_gathering(g)

    r = client.get('/api/me/org/analytics', headers=_h(roster['owner']))
    assert r.status_code == 200
    a = r.get_json()['analytics']
    acc = a['forecastAccuracy']
    assert acc is not None
    assert acc['nGatherings'] >= 1
    assert acc['formulaMae'] is not None
    assert acc['confirmedMae'] is not None
    assert acc['source'] in ('model', 'formula')
    assert 'expectedTotal' in a


def test_quality_endpoint(client):
    """Паспорт модели доступен без авторизации и не выдумывает чисел."""
    r = client.get('/api/forecast/quality')
    assert r.status_code == 200
    body = r.get_json()
    assert 'available' in body
    if body.get('comparison'):
        keys = [row['key'] for row in body['comparison']]
        assert keys == ['answer_only', 'formula', 'model']
