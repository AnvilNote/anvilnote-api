export interface AIKeyProfileRecord {
  id: string;
  providerId: string;
  label: string;
  encryptedSecret: string;
  safeDisplayPrefix: string;
  lastFour: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface AIKeyProfileMetadata {
  id: string;
  providerId: string;
  label: string;
  display: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAIKeyProfileInput {
  providerId: string;
  label: string;
  encryptedSecret: string;
  safeDisplayPrefix: string;
  lastFour: string;
  isActive: boolean;
}
