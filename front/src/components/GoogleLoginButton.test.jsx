import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import GoogleLoginButton from './GoogleLoginButton';
import { api } from '../lib/api';
import { startGoogleLogin } from '../lib/oauth';
jest.mock('../lib/api', () => ({ api: { oauthProviders: jest.fn() } }));
jest.mock('../lib/oauth', () => ({ startGoogleLogin: jest.fn() }));

beforeEach(() => jest.clearAllMocks());
test('hides Google when the server has no credentials', async () => {
  api.oauthProviders.mockResolvedValue({ providers: [] });
  const { container } = render(<GoogleLoginButton />);
  await waitFor(() => expect(api.oauthProviders).toHaveBeenCalled());
  expect(container).toBeEmptyDOMElement();
});
test('starts configured Google login and preserves the invitation', async () => {
  api.oauthProviders.mockResolvedValue({ providers: ['google'] });
  startGoogleLogin.mockResolvedValue();
  render(<GoogleLoginButton returnTo="/g/TEST" />);
  fireEvent.click(await screen.findByRole('button', { name: 'Продолжить с Google' }));
  expect(startGoogleLogin).toHaveBeenCalledWith('/g/TEST');
});
