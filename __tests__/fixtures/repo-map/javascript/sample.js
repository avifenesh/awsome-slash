import fs from 'fs';
import { readFile } from 'fs';
import './side-effect';
const path = require('path');

export function exportedFn() { return 1; }
export class ExportedClass { method() { return 2; } }
export const EXPORTED_CONST = 3;
const localExport = 4;
export { localExport };

function localFn() { return 5; }
const arrowFn = (value) => value + 1;
class LocalClass {}

module.exports = { cjsExport };
exports.named = 6;
const cjsExport = 7;
