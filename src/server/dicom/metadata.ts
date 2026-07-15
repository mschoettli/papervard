import "server-only";

import { open, stat } from "node:fs/promises";
import dicomParser from "dicom-parser";

const INITIAL_HEADER_BYTES = 1024 * 1024;
const MAX_HEADER_BYTES = 64 * 1024 * 1024;

export type DicomMetadata = {
  studyInstanceUid: string;
  seriesInstanceUid: string;
  sopInstanceUid: string;
  patientName?: string;
  patientBirthDate?: string;
  patientId?: string;
  studyDate?: string;
  studyDescription?: string;
  seriesNumber?: number;
  instanceNumber?: number;
  modality?: string;
  seriesDescription?: string;
  bodyPart?: string;
  rows?: number;
  columns?: number;
  frames: number;
  transferSyntaxUid?: string;
};

function required(value: string | undefined, label: string) {
  const clean = value?.trim();
  if (!clean) throw new Error(`DICOM-Metadatum ${label} fehlt.`);
  return clean;
}

function clean(value: string | undefined) {
  return value?.replace(/\0/g, "").trim() || undefined;
}

function parseHeader(bytes: Uint8Array): DicomMetadata {
  const dataSet = dicomParser.parseDicom(bytes, { untilTag: "x7fe00010" });
  return {
    studyInstanceUid: required(clean(dataSet.string("x0020000d")), "StudyInstanceUID"),
    seriesInstanceUid: required(clean(dataSet.string("x0020000e")), "SeriesInstanceUID"),
    sopInstanceUid: required(clean(dataSet.string("x00080018")), "SOPInstanceUID"),
    patientName: clean(dataSet.string("x00100010")),
    patientBirthDate: clean(dataSet.string("x00100030")),
    patientId: clean(dataSet.string("x00100020")),
    studyDate: clean(dataSet.string("x00080020")),
    studyDescription: clean(dataSet.string("x00081030")),
    seriesNumber: dataSet.intString("x00200011"),
    instanceNumber: dataSet.intString("x00200013"),
    modality: clean(dataSet.string("x00080060")),
    seriesDescription: clean(dataSet.string("x0008103e")),
    bodyPart: clean(dataSet.string("x00180015")),
    rows: dataSet.uint16("x00280010"),
    columns: dataSet.uint16("x00280011"),
    frames: dataSet.intString("x00280008") ?? 1,
    transferSyntaxUid: clean(dataSet.string("x00020010"))
  };
}

export async function readDicomMetadata(filePath: string) {
  const fileSize = (await stat(filePath)).size;
  const file = await open(filePath, "r");
  try {
    let headerBytes = Math.min(fileSize, INITIAL_HEADER_BYTES);
    while (true) {
      const buffer = Buffer.alloc(headerBytes);
      const { bytesRead } = await file.read(buffer, 0, headerBytes, 0);
      try {
        return parseHeader(buffer.subarray(0, bytesRead));
      } catch (error) {
        const canGrow = bytesRead < fileSize && headerBytes < MAX_HEADER_BYTES;
        if (!canGrow) throw error;
        headerBytes = Math.min(fileSize, headerBytes * 2, MAX_HEADER_BYTES);
      }
    }
  } finally {
    await file.close();
  }
}
