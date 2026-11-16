export interface MoodleSessionCredentials {
  session: string;
  sesskey: string;
}

export interface AuthProvider {
  getCredentials(): Promise<MoodleSessionCredentials>;
  invalidate?(): void;
}
