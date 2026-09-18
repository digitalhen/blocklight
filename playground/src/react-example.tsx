import './worker.js';
import { StrictMode, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { CityMapView } from 'blocklight/react';
import { buildings, polygons, type ThemeName } from 'blocklight';
import { nyc } from 'blocklight/nyc';
import 'maplibre-gl/dist/maplibre-gl.css';
import './style.css';
function Example() {
  const [theme, setTheme] = useState<ThemeName>('blueprint');
  const [mounted, setMounted] = useState(true);
  const [status, setStatus] = useState('Loading React map…');
  const layers = useMemo(() => [polygons({ id: 'land', source: './data/land.geojson', interactive: false, attribution: 'NYC Open Data' }), buildings({ id: 'buildings', source: './data/buildings.geojson' })], []);
  return <><header><a className="brand" href="./">blocklight <span className="version">React example</span></a><nav><button onClick={() => setTheme(t => t === 'blueprint' ? 'paper' : 'blueprint')}>Switch theme</button><button onClick={() => setMounted(m => !m)}>{mounted ? 'Unmount' : 'Mount'} map</button></nav></header><p style={{ padding: '0 24px' }} role="status">{status}</p><div style={{ height: '75vh' }}>{mounted && <CityMapView city={nyc} theme={theme} layers={layers} onReady={() => setStatus('Ready · React Strict Mode')} onSelect={selection => setStatus(selection ? `${selection.feature.properties.height_m} m` : 'No selection')} onError={error => setStatus(error.message)} />}</div></>;
}
createRoot(document.getElementById('root')!).render(<StrictMode><Example /></StrictMode>);
