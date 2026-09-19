import { useCallback, useEffect, useState } from 'react';
import * as DocumentPicker from 'expo-document-picker';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { ActivityIndicator, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { api, jsonBody, login, logout, restoreSession, type ForecastRun, type ImportRecord, type Overview, type Product, type Series, type User } from './src/api';

const c = { bg: '#0e1422', card: '#192234', raised: '#222d42', line: '#304056', text: '#f3f8ff', muted: '#a7b4c9', blue: '#3e7bfa', cyan: '#1fd4c0', red: '#fb6674', amber: '#ffc06b' };
type Tab = 'Home' | 'Products' | 'Forecast' | 'Upload' | 'Account';
const tabs: Tab[] = ['Home', 'Products', 'Forecast', 'Upload', 'Account'];
const number = (value: number) => Number(value || 0).toLocaleString();
const money = (value: number, currency: string) => `${currency === 'PKR' ? 'Rs' : `${currency} `}${number(Math.round(value))}`;
const message = (error: unknown) => error instanceof Error ? error.message : 'Please try again.';

function Button({ title, onPress, secondary = false, disabled = false }: { title: string; onPress: () => void; secondary?: boolean; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[s.button, secondary && s.secondary, disabled && { opacity: 0.6 }]}><Text style={s.buttonText}>{title}</Text></Pressable>;
}
function Card({ children }: { children: React.ReactNode }) { return <View style={s.card}>{children}</View>; }
function Field({ label, value, onChangeText, secure = false, numeric = false }: { label: string; value: string; onChangeText: (v: string) => void; secure?: boolean; numeric?: boolean }) {
  return <View><Text style={s.label}>{label}</Text><TextInput accessibilityLabel={label} value={value} onChangeText={onChangeText} secureTextEntry={secure} keyboardType={numeric ? 'numeric' : label === 'Email' ? 'email-address' : 'default'} autoCapitalize="none" autoCorrect={false} placeholderTextColor={c.muted} style={s.input} /></View>;
}
function ErrorText({ text }: { text: string }) { return text ? <Text style={s.error}>{text}</Text> : null; }

function Login({ onLogin }: { onLogin: (user: User) => void }) {
  const [email, setEmail] = useState(''), [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function submit() {
    if (!email.trim() || !password) { setError('Enter your email and password.'); return; }
    setBusy(true); setError('');
    try { onLogin(await login(email.trim(), password)); } catch (cause) { setError(message(cause)); } finally { setBusy(false); }
  }
  return <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><ScrollView contentContainerStyle={s.login} keyboardShouldPersistTaps="handled">
    <Image source={require('./assets/stockguard-logo.png')} style={s.logo} resizeMode="contain" accessibilityLabel="StockGuard AI logo" />
    <Text style={s.title}>Your inventory, in focus.</Text><Text style={s.muted}>Sign in to view live business data and demand forecasts.</Text>
    <Card><Field label="Email" value={email} onChangeText={setEmail} /><Field label="Password" value={password} onChangeText={setPassword} secure /><ErrorText text={error} /><Button title={busy ? 'Signing in…' : 'Sign in'} onPress={submit} disabled={busy} /></Card>
    <Text style={s.note}>Use the same account as the StockGuard website.</Text>
  </ScrollView></KeyboardAvoidingView>;
}

function Home({ currency }: { currency: string }) {
  const [data, setData] = useState<Overview | null>(null), [error, setError] = useState('');
  const load = useCallback(async () => { try { setData(await api<Overview>('/analytics/overview?days=30')); setError(''); } catch (cause) { setError(message(cause)); } }, []);
  useEffect(() => { void load(); }, [load]);
  return <ScrollView contentContainerStyle={s.content}><Text style={s.title}>Overview</Text><Text style={s.muted}>Last 30 days of recorded sales</Text><ErrorText text={error} />
    {!data && !error && <ActivityIndicator color={c.cyan} />}
    {data && <><View style={s.grid}>
      {([['Revenue', money(data.totals.revenue, currency)], ['Units sold', number(data.totals.units)], ['Sale records', number(data.totals.saleRecords)], ['Low stock', number(data.totals.lowStockLocations)]] as const).map(([label, value]) => <View key={label} style={s.metricCard}><Text style={s.muted}>{label}</Text><Text style={s.metric}>{value}</Text></View>)}
    </View><Card><Text style={s.cardTitle}>Recent sales trend</Text>{data.daily.length ? <View style={s.chart}>{data.daily.slice(-12).map((day, _, list) => <View key={day.date} style={[s.bar, { height: 12 + (day.revenue / Math.max(...list.map(p => p.revenue), 1)) * 80 }]} />)}</View> : <Text style={s.muted}>Upload sales data to see a trend.</Text>}<Text style={s.note}>{data.period.startDate || 'No sales'} – {data.period.endDate || 'No sales'}</Text></Card>
      <Card><Text style={s.cardTitle}>Top products</Text>{data.productSales.slice(0, 4).map(item => <View style={s.row} key={item.productId}><View style={{ flex: 1 }}><Text style={s.strong}>{item.name}</Text><Text style={s.muted}>{item.sku} · {number(item.units)} units</Text></View><Text style={s.strong}>{money(item.revenue, currency)}</Text></View>)}{!data.productSales.length && <Text style={s.muted}>No sales yet.</Text>}</Card>
      <Card><Text style={s.cardTitle}>Latest forecast</Text>{data.latestForecast ? <><Text style={s.strong}>{data.latestForecast.productName}</Text><Text style={s.muted}>{data.latestForecast.horizonDays} days · {data.latestForecast.model}</Text><Text style={s.accent}>{number(data.latestForecast.forecastTotal)} predicted units</Text></> : <Text style={s.muted}>Run a forecast after importing sales data.</Text>}</Card>
    </>}
    <Button title="Refresh overview" onPress={() => void load()} secondary />
  </ScrollView>;
}

function Products({ currency, canWrite }: { currency: string; canWrite: boolean }) {
  const [products, setProducts] = useState<Product[]>([]), [search, setSearch] = useState(''), [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false), [busy, setBusy] = useState(false);
  const [name, setName] = useState(''), [sku, setSku] = useState(''), [category, setCategory] = useState('');
  const [stock, setStock] = useState('0'), [reorder, setReorder] = useState('0'), [price, setPrice] = useState('0');
  const load = useCallback(async () => { try { setProducts((await api<{ products: Product[] }>('/products')).products); setError(''); } catch (cause) { setError(message(cause)); } }, []);
  useEffect(() => { void load(); }, [load]);
  async function create() {
    if (!name.trim() || !sku.trim()) { setError('Name and SKU are required.'); return; }
    setBusy(true); setError('');
    try { await api('/products', jsonBody({ name, sku, category, stock: Number(stock), reorder: Number(reorder), price: Number(price) })); setShowForm(false); setName(''); setSku(''); await load(); }
    catch (cause) { setError(message(cause)); } finally { setBusy(false); }
  }
  const visible = products.filter(p => `${p.name} ${p.sku} ${p.category}`.toLowerCase().includes(search.toLowerCase()));
  return <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled"><Text style={s.title}>Products</Text><Text style={s.muted}>{products.length} items in your business</Text>
    <TextInput accessibilityLabel="Search products" style={s.input} placeholder="Search products or SKU" placeholderTextColor={c.muted} value={search} onChangeText={setSearch} />
    {canWrite && <Button title={showForm ? 'Close form' : '+ Add product'} onPress={() => setShowForm(!showForm)} secondary={showForm} />}
    {showForm && <Card><Text style={s.cardTitle}>New product</Text><Field label="Name" value={name} onChangeText={setName} /><Field label="SKU" value={sku} onChangeText={setSku} /><Field label="Category" value={category} onChangeText={setCategory} /><Field label="Stock" value={stock} onChangeText={setStock} numeric /><Field label="Reorder point" value={reorder} onChangeText={setReorder} numeric /><Field label="Price" value={price} onChangeText={setPrice} numeric /><Button title={busy ? 'Saving…' : 'Save product'} onPress={create} disabled={busy} /></Card>}
    <ErrorText text={error} />{visible.map(p => { const low = p.reorder > 0 && p.stock < p.reorder; return <Card key={p.id}><View style={s.row}><View style={{ flex: 1 }}><Text style={s.strong}>{p.name}</Text><Text style={s.muted}>{p.sku} · {p.category || 'Uncategorized'}</Text></View><Text style={[s.badge, low && { color: c.amber }]}>{low ? 'LOW' : 'OK'}</Text></View><View style={s.row}><Text style={s.muted}>Stock {number(p.stock)} · reorder {number(p.reorder)}</Text><Text style={s.strong}>{money(p.price, currency)}</Text></View></Card>; })}
    {!visible.length && <Text style={s.muted}>No matching products.</Text>}<Button title="Refresh products" onPress={() => void load()} secondary />
  </ScrollView>;
}

function Forecast({ canWrite }: { canWrite: boolean }) {
  const [series, setSeries] = useState<Series[]>([]), [selected, setSelected] = useState<Series | null>(null);
  const [run, setRun] = useState<ForecastRun | null>(null), [horizon, setHorizon] = useState<7 | 14 | 28>(28);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const load = useCallback(async () => { try { const [a, b] = await Promise.all([api<{ series: Series[] }>('/forecasts/series'), api<{ run: ForecastRun | null }>('/forecasts/latest')]); setSeries(a.series); setSelected(current => current || a.series[0] || null); setRun(b.run); setError(''); } catch (cause) { setError(message(cause)); } }, []);
  useEffect(() => { void load(); }, [load]);
  async function generate() { if (!selected) return; setBusy(true); setError(''); try { setRun((await api<{ run: ForecastRun }>('/forecasts/run', jsonBody({ storeId: selected.storeId, productId: selected.productId, horizon }))).run); } catch (cause) { setError(message(cause)); } finally { setBusy(false); } }
  return <ScrollView contentContainerStyle={s.content}><Text style={s.title}>AI forecast</Text><Text style={s.muted}>Demand from your uploaded sales history</Text>
    <Card><Text style={s.cardTitle}>Sales series</Text><ScrollView horizontal showsHorizontalScrollIndicator={false}>{series.map(item => <Pressable key={`${item.storeId}-${item.productId}`} onPress={() => setSelected(item)} style={[s.chip, selected?.storeId === item.storeId && selected.productId === item.productId && s.chipActive]}><Text style={s.strong}>{item.productName} · {item.storeCode}</Text></Pressable>)}</ScrollView>
      {!series.length && <Text style={s.muted}>Upload a sales CSV to enable forecasting.</Text>}{selected && <Text style={s.muted}>{number(selected.observations)} records · latest {selected.latestActualDate}</Text>}
      <Text style={s.label}>Horizon</Text><View style={s.row}>{([7, 14, 28] as const).map(days => <Pressable key={days} onPress={() => setHorizon(days)} style={[s.chip, horizon === days && s.chipActive]}><Text style={s.strong}>{days} days</Text></Pressable>)}</View>
      {canWrite && <Button title={busy ? 'Generating…' : 'Run forecast'} onPress={generate} disabled={busy || !selected} />}</Card><ErrorText text={error} />
    {run ? <><Card><Text style={s.cardTitle}>{run.productName}</Text><Text style={s.muted}>{run.sku} · {run.storeCode}</Text><Text style={s.big}>{number(run.forecastTotal)}</Text><Text style={s.muted}>Predicted units over {run.horizon} days</Text><Text style={s.muted}>Model: {run.model.replaceAll('_', ' ')}</Text><Text style={s.muted}>Last actual: {run.latestActualDate} · starts {run.forecastStartDate}</Text><Text style={s.muted}>Backtest MAE {run.backtest.mae.toFixed(2)} · RMSE {run.backtest.rmse.toFixed(2)}</Text></Card><Card><Text style={s.cardTitle}>Daily predictions</Text>{run.predictions.map(point => <View style={s.row} key={point.date}><Text style={s.muted}>{point.date}</Text><Text style={s.strong}>{point.forecast_sales.toFixed(2)} units</Text></View>)}</Card></> : <Text style={s.muted}>No saved forecast yet.</Text>}
    <Text style={s.note}>Business CSV forecasts currently use a seasonal baseline. The Kaggle XGBoost model applies to its historical dataset.</Text>
  </ScrollView>;
}

function Upload({ canWrite }: { canWrite: boolean }) {
  const [history, setHistory] = useState<ImportRecord[]>([]), [error, setError] = useState(''), [success, setSuccess] = useState(''), [busy, setBusy] = useState(false);
  const load = useCallback(async () => { try { setHistory((await api<{ imports: ImportRecord[] }>('/imports')).imports); } catch (cause) { setError(message(cause)); } }, []);
  useEffect(() => { void load(); }, [load]);
  async function choose() {
    setError(''); setSuccess('');
    try { const picked = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true }); if (picked.canceled) return;
      const file = picked.assets[0]; if (!file.name.toLowerCase().endsWith('.csv')) { setError('Choose a .csv file.'); return; }
      if ((file.size || 0) > 2 * 1024 * 1024) { setError('CSV file must be 2 MB or smaller.'); return; }
      setBusy(true); const form = new FormData(); form.append('file', { uri: file.uri, name: file.name, type: 'text/csv' } as unknown as Blob);
      const result = await api<{ import: ImportRecord }>('/imports/sales', { method: 'POST', body: form }); setSuccess(`${result.import.records} records imported.`); await load();
    } catch (cause) { setError(message(cause)); } finally { setBusy(false); }
  }
  return <ScrollView contentContainerStyle={s.content}><Text style={s.title}>CSV upload</Text><Text style={s.muted}>Bring your sales history into StockGuard</Text>
    <Card><Text style={s.cardTitle}>Sales data file</Text><Text style={s.muted}>Select a CSV up to 2 MB. The server validates it before import.</Text>{canWrite ? <Button title={busy ? 'Uploading…' : 'Choose CSV file'} onPress={choose} disabled={busy} /> : <Text style={s.muted}>Your role cannot upload files.</Text>}<ErrorText text={error} />{success ? <Text style={s.accent}>{success}</Text> : null}</Card>
    <Card><Text style={s.cardTitle}>Required columns</Text><Text style={s.code}>date, sku, product_name, category, quantity_sold, revenue</Text><Text style={s.note}>Optional: store_id. Dates use YYYY-MM-DD. Each row represents one product at one store on one day.</Text></Card>
    <Text style={s.cardTitle}>Recent uploads</Text>{history.map(item => <Card key={item.id}><Text style={s.strong}>{item.name}</Text><Text style={s.muted}>{number(item.records)} records · {item.status} · {item.date.slice(0, 10)}</Text></Card>)}{!history.length && <Text style={s.muted}>No uploads yet.</Text>}
  </ScrollView>;
}

function Account({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [busy, setBusy] = useState(false);
  async function signOut() { setBusy(true); await logout(); onLogout(); setBusy(false); }
  return <ScrollView contentContainerStyle={s.content}><Text style={s.title}>Account</Text><Text style={s.muted}>Your StockGuard workspace</Text><Card><Text style={s.cardTitle}>{user.name}</Text><Text style={s.muted}>{user.email}</Text><Text style={s.label}>Business</Text><Text style={s.strong}>{user.business?.name || 'No business'}</Text><Text style={s.label}>Role</Text><Text style={s.strong}>{user.role}</Text></Card><Button title={busy ? 'Signing out…' : 'Sign out'} onPress={signOut} disabled={busy} secondary /><Text style={s.note}>Use forecasts alongside business judgment before placing orders.</Text></ScrollView>;
}

function Main({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [tab, setTab] = useState<Tab>('Home'), canWrite = ['owner', 'admin', 'analyst'].includes(user.role);
  return <View style={{ flex: 1 }}><View style={s.header}><View><Text style={s.brand}>StockGuard <Text style={{ color: c.cyan }}>AI</Text></Text><Text style={s.note}>{user.business?.name || 'Workspace'}</Text></View><Text style={s.avatar}>{user.name.slice(0, 1).toUpperCase()}</Text></View>
    <View style={{ flex: 1 }}>{tab === 'Home' ? <Home currency={user.business?.currency || 'PKR'} /> : tab === 'Products' ? <Products currency={user.business?.currency || 'PKR'} canWrite={canWrite} /> : tab === 'Forecast' ? <Forecast canWrite={canWrite} /> : tab === 'Upload' ? <Upload canWrite={canWrite} /> : <Account user={user} onLogout={onLogout} />}</View>
    <View style={s.tabs}>{tabs.map(item => <Pressable key={item} accessibilityRole="tab" accessibilityState={{ selected: item === tab }} onPress={() => setTab(item)} style={s.tab}><Text style={[s.tabText, item === tab && { color: c.cyan }]}>{item}</Text></Pressable>)}</View>
  </View>;
}

export default function App() {
  const [user, setUser] = useState<User | null>(null), [starting, setStarting] = useState(true), [error, setError] = useState('');
  const start = useCallback(async () => { setStarting(true); setError(''); try { setUser(await restoreSession()); } catch (cause) { setError(`Connection error: ${message(cause)}`); } finally { setStarting(false); } }, []);
  useEffect(() => { void start(); }, [start]);
  return <SafeAreaProvider><SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={['top', 'bottom']}><StatusBar style="light" />{starting ? <ActivityIndicator style={{ flex: 1 }} color={c.cyan} /> : user ? <Main user={user} onLogout={() => setUser(null)} /> : <Login onLogin={setUser} />}{error ? <View style={{ padding: 12 }}><ErrorText text={error} /><Button title="Retry connection" onPress={() => void start()} secondary /></View> : null}</SafeAreaView></SafeAreaProvider>;
}

const s = StyleSheet.create({
  content: { padding: 20, paddingBottom: 32, gap: 14 }, login: { flexGrow: 1, padding: 24, justifyContent: 'center', gap: 14 }, logo: { width: 210, height: 210, alignSelf: 'center' },
  title: { color: c.text, fontSize: 25, fontWeight: '800' }, muted: { color: c.muted, fontSize: 12, lineHeight: 18 }, note: { color: c.muted, fontSize: 11, lineHeight: 17 },
  card: { backgroundColor: c.card, borderRadius: 18, borderWidth: 1, borderColor: c.line, padding: 16, gap: 10 }, cardTitle: { color: c.text, fontWeight: '700', fontSize: 16 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 10 }, metricCard: { width: '48%', backgroundColor: c.card, padding: 15, borderRadius: 16, borderWidth: 1, borderColor: c.line }, metric: { color: c.text, fontSize: 19, fontWeight: '800', marginTop: 5 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, paddingVertical: 5 }, strong: { color: c.text, fontSize: 12, fontWeight: '700' }, accent: { color: c.cyan, fontSize: 14, fontWeight: '800' }, big: { color: c.cyan, fontSize: 38, fontWeight: '800' },
  chart: { height: 108, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 5 }, bar: { flex: 1, borderRadius: 5, backgroundColor: c.blue },
  button: { minHeight: 44, backgroundColor: c.blue, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 }, secondary: { backgroundColor: c.raised, borderColor: c.line, borderWidth: 1 }, buttonText: { color: 'white', fontWeight: '700', fontSize: 13 },
  label: { color: '#b8c8e0', fontSize: 12, fontWeight: '600', marginTop: 5 }, input: { color: c.text, backgroundColor: c.raised, borderWidth: 1, borderColor: c.line, borderRadius: 12, minHeight: 44, paddingHorizontal: 12 }, error: { color: c.red, fontSize: 12 },
  badge: { color: c.cyan, fontSize: 11, fontWeight: '800' }, chip: { backgroundColor: c.raised, borderWidth: 1, borderColor: c.line, borderRadius: 10, padding: 9, marginRight: 6 }, chipActive: { borderColor: c.blue, backgroundColor: '#18446b' }, code: { color: c.cyan, fontSize: 11, lineHeight: 18 },
  header: { paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 1, borderColor: c.line, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, brand: { color: c.text, fontSize: 20, fontWeight: '800' }, avatar: { color: 'white', backgroundColor: c.blue, overflow: 'hidden', borderRadius: 12, padding: 10, fontWeight: '800' },
  tabs: { flexDirection: 'row', backgroundColor: c.card, borderTopWidth: 1, borderColor: c.line, paddingVertical: 9 }, tab: { flex: 1, alignItems: 'center', paddingVertical: 8 }, tabText: { color: c.muted, fontSize: 10, fontWeight: '700' },
});
