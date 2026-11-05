import { render, screen } from '@testing-library/react';
import { TextEncoder } from 'util';

global.TextEncoder = TextEncoder;
// CRA's Jest resolver predates package exports; the core package exposes the same router.
jest.mock('react-router-dom', () => jest.requireActual('react-router'));
const { MemoryRouter, useLocation } = require('react-router-dom');
const mockShellVisits = [];
const mockSession = { token: null, name: null, booted: true, userType: null, boot: async () => null };

jest.mock('./components/shell/Shell', () => {
  const { Outlet, useLocation } = require('react-router-dom');
  return function Shell() {
    mockShellVisits.push(useLocation().pathname);
    return <Outlet />;
  };
});
jest.mock('./sheets/Sheets', () => () => null);
jest.mock('./components/ui/feedback', () => ({ Toast: () => null }));
jest.mock('./store/useSessionStore', () => {
  return { useSessionStore: Object.assign((select) => select(mockSession), { getState: () => mockSession }) };
});
jest.mock('./store/usePlatformStore', () => ({
  usePlatformStore: { getState: () => ({ loadPlatform: jest.fn() }) },
}));
jest.mock('./store/useGatheringStore', () => ({ useGatheringStore: { getState: () => ({}) } }));

// Keep the actual route table while isolating page data fetching and the globe renderer.
for (const page of [
  'Home', 'Login', 'Register', 'OAuthCallback', 'Legal', 'Feed', 'MapPage', 'Event', 'NewGathering',
  'GuestGathering', 'CoordGathering', 'CheckIn', 'AttendanceConfirm', 'MyGatherings', 'MyEvents', 'Manage',
  'ManageRequests', 'ManageVolunteers', 'ManageOrg', 'Profile', 'Org', 'Leaderboard',
  'ForecastQuality', 'Messages', 'Convo', 'Notifications', 'Admin', 'NotFound', 'ProjectRights',
]) {
  jest.doMock(`./pages/${page}`, () => ({ __esModule: true, default: () => <div>{page}</div> }));
}
const App = require('./App').default;

function Location() {
  return <output aria-label="Current route">{useLocation().pathname}</output>;
}

beforeEach(() => {
  mockShellVisits.length = 0;
  Object.assign(mockSession, { token: null, name: null, booted: true, userType: null });
});

test('OAuth callback stays reachable without restoring a previous account session', () => {
  const previousBoot = mockSession.boot;
  const boot = jest.fn();
  Object.assign(mockSession, { token: 'old-session', name: 'Previous User', booted: false, boot });
  try {
    render(<MemoryRouter initialEntries={['/oauth/callback']}><App /></MemoryRouter>);
    expect(screen.getByText('OAuthCallback')).toBeInTheDocument();
    expect(boot).not.toHaveBeenCalled();
  } finally {
    mockSession.boot = previousBoot;
  }
});

test.each([
  ['/charity', '/feed', 'Feed'],
  ['/charity/old-campaign', '/feed', 'Feed'],
  ['/admin/charity', '/admin', 'Admin'],
])('retired %s redirects before entering the protected shell', async (source, destination, page) => {
  render(<MemoryRouter initialEntries={[source]}><App /><Location /></MemoryRouter>);
  expect(await screen.findByText(page)).toBeInTheDocument();
  expect(screen.getByLabelText('Current route')).toHaveTextContent(destination);
  expect(mockShellVisits).not.toContain(source);
});

test.each([
  ['/e/e1', 'Event'], ['/g/PARK18', 'GuestGathering'], ['/new', 'NewGathering'],
  ['/me', 'MyGatherings'], ['/c/1', 'CoordGathering'], ['/my-events', 'MyEvents'], ['/attendance/1', 'AttendanceConfirm'],
])('volunteer event route %s remains available', async (path, page) => {
  render(<MemoryRouter initialEntries={[path]}><App /><Location /></MemoryRouter>);
  expect(await screen.findByText(page)).toBeInTheDocument();
  expect(screen.getByLabelText('Current route')).toHaveTextContent(path);
});

test.each(['/', '/login', '/register'])('signed-in admin opens %s directly in admin', async (path) => {
  mockSession.userType = 'admin';
  render(<MemoryRouter initialEntries={[path]}><App /><Location /></MemoryRouter>);
  expect(await screen.findByText('Admin')).toBeInTheDocument();
  expect(screen.getByLabelText('Current route')).toHaveTextContent('/admin');
  expect(screen.queryByText('Home')).not.toBeInTheDocument();
});

test('restored session waits for its actual account type without mounting ordinary pages', () => {
  Object.assign(mockSession, { token: 'saved-token', booted: false });
  const view = render(<MemoryRouter initialEntries={['/']}><App /><Location /></MemoryRouter>);
  expect(screen.getByText('Проверяем доступ…')).toHaveAttribute('role', 'status');
  expect(screen.queryByText('Home')).not.toBeInTheDocument();
  expect(mockShellVisits).toEqual([]);
  Object.assign(mockSession, { userType: 'admin', booted: true });
  view.rerender(<MemoryRouter initialEntries={['/']}><App /><Location /></MemoryRouter>);
  expect(screen.getByText('Admin')).toBeInTheDocument();
  expect(screen.queryByText('Home')).not.toBeInTheDocument();
});
