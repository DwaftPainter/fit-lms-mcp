import { AuthProvider } from "./auth-provider.js";
import { AutoLoginAuthProvider } from "./auto-login-auth-provider.js";
import { ManualSessionProvider } from "./manual-session-provider.js";
import { LmsConfig } from "../../config/env.js";

const autoLoginProviders = new Map<string, AutoLoginAuthProvider>();

export function getAuthProvider(config: LmsConfig): AuthProvider {
  if (config.username && config.password) {
    const key = `${config.baseUrl}:::${config.username}`;
    let provider = autoLoginProviders.get(key);
    if (!provider) {
      provider = new AutoLoginAuthProvider({
        baseUrl: config.baseUrl,
        username: config.username,
        password: config.password,
        timeoutMs: config.timeoutMs,
      });
      autoLoginProviders.set(key, provider);
    }
    return provider;
  }

  return ManualSessionProvider.fromConfig(config);
}

export function clearAuthProviderCache(): void {
  autoLoginProviders.clear();
}
