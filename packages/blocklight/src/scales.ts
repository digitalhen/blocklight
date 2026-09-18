import type { ExpressionSpecification } from 'maplibre-gl';
export interface LegendItem { label: string; color: string }
export interface ColorScale { expression: ExpressionSpecification; legend: readonly LegendItem[] }
/** One definition drives the map and its legend. Null/missing values remain neutral. */
export function steppedScale(property: string, stops: readonly { value: number; color: string; label?: string }[], noData = '#7683a0'): ColorScale {
  if (!property || !stops.length || stops.some((s, i) => !Number.isFinite(s.value) || (i > 0 && s.value <= stops[i - 1].value))) {
    throw new Error('A scale needs a property and finite, strictly increasing stops.');
  }
  const step: ExpressionSpecification = ['step', ['get', property], stops[0].color];
  for (const stop of stops.slice(1)) step.push(stop.value, stop.color);
  return {
    expression: ['case', ['==', ['typeof', ['get', property]], 'number'], step, noData] as ExpressionSpecification,
    legend: [...stops.map(s => ({ label: s.label ?? String(s.value), color: s.color })), { label: 'No data', color: noData }],
  };
}
