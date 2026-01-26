import type { TypeA } from './types';
import { valueA } from './values';

export interface SampleInterface { name: string; }
export type SampleType = { id: number };
export enum SampleEnum { One, Two }
export namespace SampleNamespace { export const value = 1; }

export const exportedValue = valueA;
export function exportedFn(input: TypeA): number { return input.id; }

type LocalType = string;
interface LocalInterface { active: boolean; }
const enum LocalEnum { A, B }
abstract class AbstractThing { abstract run(): void; }
