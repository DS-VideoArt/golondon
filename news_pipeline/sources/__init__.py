# -*- coding: utf-8 -*-
"""
רשימת המקורות. כל מקור הוא מילון עם id, name, url, licence, attribution, terms, group,
ופונקציית collect(fetcher, ctx) שמחזירה רשימת מועמדים.

הסדר חשוב: tfl_live לפני tfl_planned, כי הוא מספק את רשימת הקווים העדכנית.
מקור שנכשל לא עוצר את הריצה. הכישלון נרשם בדוח עם הסיבה.
"""
from . import tfl, govuk, metoffice, vam, tate, royalparks, heathrow

ALL = (tfl.SOURCES + govuk.SOURCES + metoffice.SOURCES + vam.SOURCES + tate.SOURCES
       + royalparks.SOURCES + heathrow.SOURCES)
BY_ID = {s['id']: s for s in ALL}
