import { render, screen } from '@testing-library/react';
import { TextEncoder } from 'util';

global.TextEncoder = TextEncoder;
// CRA's Jest resolver predates package exports; the core package exposes the same router.
jest.mock('react-router-dom', () => jest.requireActual('react-router'));
const { MemoryRouter, useLocation } = require('react-router-dom');
const mockShellVisits = [];

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
  const state = { token: null, name: null, boot: async () => null };
  return { useSessionStore: Object.assign((select) => select(state), { getState: () => state }) };
});
jest.mock('./store/usePlatformStore', () => ({
  usePlatformStore: { getState: () => ({ loadPlatform: jest.fn() }) },
}));
jest.mock('./store/useGatheringStore', () => ({ useGatheringStore: { getState: () => ({}) } }));

// Keep the actual route table while isolating page data fetching and the globe renderer.
for (const page of [
  'Home', 'Login', 'Register', 'Legal', 'Feed', 'MapPage', 'Event', 'NewGathering',
  'GuestGathering', 'CoordGathering', 'CheckIn', 'MyGatherings', 'MyEvents', 'Manage',
  'ManageRequests', 'ManageVolunteers', 'ManageOrg', 'Profile', 'Org', 'Leaderboard',
  'ForecastQuality', 'Messages', 'Convo', 'Notifications', 'Admin', 'NotFound', 'ProjectRights',
]) {
  jest.doMock(`./pages/${page}`, () => ({ __esModule: true, default: () => <div>{page}</div> }));
}
const App = require('./App').default;

function Location() {
  return <output aria-label="Current route">{useLocation().pathname}</output>;
}

beforeEach(() => { mockShellVisits.length = 0; });

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
  ['/me', 'MyGatherings'], ['/c/1', 'CoordGathering'], ['/my-events', 'MyEvents'],
])('volunteer event route %s remains available', async (path, page) => {
  render(<MemoryRouter initialEntries={[path]}><App /><Location /></MemoryRouter>);
  expect(await screen.findByText(page)).toBeInTheDocument();
  expect(screen.getByLabelText('Current route')).toHaveTextContent(path);
});
