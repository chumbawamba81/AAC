// src/models/Epoca.ts

/**
 * Model representing an Época (Basketball Season)
 * Maps to the public.epoca database table
 */
export interface Epoca {
  id: number;
  name: string;
  activa?: boolean;
}

/**
 * Database row structure for epoca table
 */
export type EpocaRow = {
  id: number;
  name: string;
  activa: boolean;
};

