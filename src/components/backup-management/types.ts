export interface CollectionCopyResult {
  name: string;
  sourceCount: number;
  targetCount: number;
  match: boolean;
  error?: string;
}

export interface SnapshotRecord {
  dbName: string;
  kind: 'daily' | 'prerestore';
  label: string;
  status: 'copying' | 'verified' | 'failed';
  createdAt: string;
  sizeBytes: number;
  totalDocuments: number;
  collections: CollectionCopyResult[];
  error?: string;
}

export interface BackupStats {
  totalBackups: number;
  verifiedBackups: number;
  totalSize: number;
  oldestBackup: string | null;
  newestBackup: string | null;
  keepCopies: number;
}

export interface CompareRow {
  name: string;
  mainCount: number;
  copyCount: number;
  state: 'match' | 'mismatch' | 'added-after-copy' | 'missing-on-live';
}

export interface CompareResult {
  dbName: string;
  label: string;
  status: string;
  rows: CompareRow[];
}

export interface InspectMatch {
  _id: string;
  label: string;
}

export interface InspectResult {
  found: boolean;
  matches: InspectMatch[];
  equal: boolean | null;
  main: unknown;
  copy: unknown;
}
