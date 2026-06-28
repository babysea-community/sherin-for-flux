export type StorageProviderId =
  | 'supabase-storage'
  | 'aws-s3'
  | 'cloudflare-r2'
  | 'vercel-blob';

export type StoreInput = {
  /** Object key relative to the storage bucket. */
  key: string;
  data: Uint8Array;
  contentType: string;
};

export type StoreResult = {
  storagePath: string;
  /** A direct public URL when available. Otherwise null and `signedUrl` is used. */
  publicUrl: string | null;
};

export interface StorageProvider {
  readonly id: StorageProviderId;
  readonly label: string;
  store(input: StoreInput): Promise<StoreResult>;
  remove?(storagePaths: string[]): Promise<void>;
  signedUrl(storagePath: string): Promise<string | null>;
}
