import { describe, expect, it } from 'vitest';
import { addDays } from '../src/lib/dates';
import { forecastNudges, frostDatesFromDaily } from '../src/lib/weather';

/** Synthetic daily weather: frosts on given month-days each year, mild otherwise. */
function synth(years: number[], frostDays: (y: number) => string[]) {
  const dates: string[] = [];
  const mins: number[] = [];
  const means: number[] = [];
  for (const y of years) {
    const frosts = new Set(frostDays(y));
    for (let d = `${y}-01-01`; d <= `${y}-12-31`; d = addDays(d, 1)) {
      dates.push(d);
      mins.push(frosts.has(d) ? -2 : 6);
      means.push(Number(d.slice(5, 7)) + 2);
    }
  }
  return { dates, mins, means };
}

describe('frost dates from history', () => {
  it('takes the median last spring frost and first autumn frost (north)', () => {
    const offsets = [-6, -3, 0, 2, 5];
    const years = [2019, 2020, 2021, 2022, 2023];
    const { dates, mins, means } = synth(years, (y) => {
      const o = offsets[years.indexOf(y)];
      return [`${y}-01-15`, `${y}-03-20`, addDays(`${y}-05-10`, o), addDays(`${y}-10-25`, o), `${y}-12-20`];
    });
    const e = frostDatesFromDaily(dates, mins, means, 'N')!;
    expect(e.lastFrost).toBe('05-10');
    expect(e.firstFrost).toBe('10-25');
    expect(e.years).toBe(5);
    expect(e.lastRange).toEqual(['05-04', '05-15']);
    expect(e.safeLastFrost).toBe('05-15');
    expect(e.safeFirstFrost).toBe('10-19');
    expect(e.monthlyMeanC[0]).toBe(3);
  });

  it('works across the new year in the south', () => {
    const years = [2019, 2020, 2021, 2022, 2023, 2024];
    const { dates, mins, means } = synth(years, (y) => [`${y}-06-20`, `${y}-09-28`, `${y}-04-22`, `${y}-07-15`]);
    const e = frostDatesFromDaily(dates, mins, means, 'S')!;
    expect(e.lastFrost).toBe('09-28');
    expect(e.firstFrost).toBe('04-22');
  });

  it('skips incomplete years', () => {
    const { dates, mins, means } = synth([2023], (y) => [`${y}-04-01`]);
    expect(frostDatesFromDaily(dates.slice(0, 200), mins.slice(0, 200), means.slice(0, 200), 'N')).toBeUndefined();
  });
});

describe('forecast nudges', () => {
  const day = (i: number, o: Partial<{ minC: number; maxC: number; rainMm: number; gustKmh: number }> = {}) =>
    ({ date: addDays('2027-05-10', i), minC: 6, maxC: 16, rainMm: 0, gustKmh: 20, ...o });

  it('warns of frost only when something tender is out', () => {
    const days = [day(0), day(1, { minC: 0.5 }), day(2)];
    expect(forecastNudges(days, ['Courgette'])).toContainEqual({ kind: 'frost', date: '2027-05-11', minC: 0.5, tender: ['Courgette'] });
    expect(forecastNudges(days, []).some((n) => n.kind === 'frost')).toBe(false);
  });

  it('spots a dry week, strong wind and heat', () => {
    const days = Array.from({ length: 7 }, (_, i) => day(i, i === 2 ? { gustKmh: 72, maxC: 29 } : {}));
    const kinds = forecastNudges(days, []).map((n) => n.kind);
    expect(kinds).toEqual(['dry', 'wind', 'heat']);
    expect(forecastNudges(days.map((d, i) => (i === 3 ? { ...d, rainMm: 6 } : d)), []).some((n) => n.kind === 'dry')).toBe(false);
  });
});
