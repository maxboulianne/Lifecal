// Copie de sauvegarde complète : les données (comme l'export JSON) et tous les fichiers de
// l'appareil (photos des reçus, justificatifs PDF, photos des fournitures, photos et vidéos des
// procédures), réunis dans un seul fichier ZIP. Restaurer la copie remet tout en place.
//
//   lifecal.json   les données
//   files.json     [{ id, type, size }] : les fichiers joints
//   files/<id>     chaque fichier, tel quel (non compressé : photos et vidéos le sont déjà)

import { zip } from "../export/xlsx.js";
import { readZip } from "../export/xlsx-read.js";

export const BACKUP_TYPE = "application/zip";
const DATA = "lifecal.json";
const MANIFEST = "files.json";
const enc = new TextEncoder();
const dec = new TextDecoder();

// files : [{ id, type, bytes: Uint8Array }]
export function buildBackup(json, files = []) {
  const manifest = files.map((f) => ({ id: f.id, type: f.type || "application/octet-stream", size: f.bytes.length }));
  return zip([
    { name: DATA, data: enc.encode(json) },
    { name: MANIFEST, data: enc.encode(JSON.stringify(manifest)) },
    ...files.map((f) => ({ name: `files/${f.id}`, data: f.bytes })),
  ]);
}

// Un fichier choisi est-il une copie complète (ZIP) ? (sinon : l'ancien export JSON)
export const isBackupZip = (bytes) => bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;

// -> { json: string, files: [{ id, type, bytes }] }
export async function readBackup(bytes) {
  const entries = readZip(bytes);
  if (!entries.has(DATA)) throw new Error("Ce n'est pas une copie LifeCal.");
  const json = dec.decode(await entries.get(DATA)());
  const manifest = entries.has(MANIFEST) ? JSON.parse(dec.decode(await entries.get(MANIFEST)())) : [];
  const files = [];
  for (const m of Array.isArray(manifest) ? manifest : []) {
    const read = entries.get(`files/${m.id}`);
    if (typeof m?.id === "string" && read) files.push({ id: m.id, type: String(m.type ?? ""), bytes: new Uint8Array(await read()) });
  }
  return { json, files };
}
