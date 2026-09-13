export interface ApiEnvelope<T> {
  data: T;
  message: string;
  timestamp: string;
}

export function ok<T>(data: T, message = 'Success'): ApiEnvelope<T> {
  return {
    data,
    message,
    timestamp: new Date().toISOString(),
  };
}
