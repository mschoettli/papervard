import "server-only";

import { prisma } from "@/lib/prisma";
import { readDicomMetadata, type DicomMetadata } from "@/server/dicom/metadata";
import { encryptSensitiveField } from "@/server/security/field-encryption";

type DicomBlobSource = {
  checksum: string;
  size: bigint;
  storagePath: string;
  mimeType?: string;
  actorUserId?: string;
  logContentChange?: boolean;
};

function dicomDate(value?: string) {
  if (!value || !/^\d{8}$/.test(value)) return null;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(4, 6));
  const day = Number(value.slice(6, 8));
  const result = new Date(Date.UTC(year, month - 1, day));
  return Number.isNaN(result.valueOf()) ? null : result;
}

export async function attachDicomInstance(documentId: string, source: DicomBlobSource, knownMetadata?: DicomMetadata) {
  const document = await prisma.document.findUnique({
    where: { id: documentId },
    select: { id: true, dicomStudy: { select: { studyInstanceUid: true } } }
  });
  if (!document) throw new Error("DICOM-Dokument nicht gefunden.");

  const metadata = knownMetadata ?? await readDicomMetadata(source.storagePath);
  if (document.dicomStudy && document.dicomStudy.studyInstanceUid !== metadata.studyInstanceUid) {
    throw new Error("DICOM-Instanz gehört nicht zur vorhandenen Studie.");
  }
  const context = metadata.studyInstanceUid;
  const study = await prisma.dicomStudy.upsert({
    where: { documentId: document.id },
    update: {
      studyInstanceUid: metadata.studyInstanceUid,
      patientNameCiphertext: encryptSensitiveField(metadata.patientName, `${context}:patient-name`),
      patientBirthDateCiphertext: encryptSensitiveField(metadata.patientBirthDate, `${context}:patient-birth-date`),
      patientIdCiphertext: encryptSensitiveField(metadata.patientId, `${context}:patient-id`),
      studyDate: dicomDate(metadata.studyDate),
      description: metadata.studyDescription
    },
    create: {
      documentId: document.id,
      studyInstanceUid: metadata.studyInstanceUid,
      patientNameCiphertext: encryptSensitiveField(metadata.patientName, `${context}:patient-name`),
      patientBirthDateCiphertext: encryptSensitiveField(metadata.patientBirthDate, `${context}:patient-birth-date`),
      patientIdCiphertext: encryptSensitiveField(metadata.patientId, `${context}:patient-id`),
      studyDate: dicomDate(metadata.studyDate),
      description: metadata.studyDescription
    }
  });
  const blob = await prisma.fileBlob.upsert({
    where: { checksum: source.checksum },
    update: {},
    create: {
      checksum: source.checksum,
      size: source.size,
      storagePath: source.storagePath,
      mimeType: source.mimeType ?? "application/dicom"
    }
  });
  const series = await prisma.dicomSeries.upsert({
    where: {
      studyId_seriesInstanceUid: {
        studyId: study.id,
        seriesInstanceUid: metadata.seriesInstanceUid
      }
    },
    update: {
      studyId: study.id,
      seriesNumber: metadata.seriesNumber,
      modality: metadata.modality,
      description: metadata.seriesDescription,
      bodyPart: metadata.bodyPart
    },
    create: {
      studyId: study.id,
      seriesInstanceUid: metadata.seriesInstanceUid,
      seriesNumber: metadata.seriesNumber,
      modality: metadata.modality,
      description: metadata.seriesDescription,
      bodyPart: metadata.bodyPart
    }
  });
  const instanceKey = {
    seriesId_sopInstanceUid: {
      seriesId: series.id,
      sopInstanceUid: metadata.sopInstanceUid
    }
  };
  const previousInstance = source.logContentChange
    ? await prisma.dicomInstance.findUnique({ where: instanceKey, select: { id: true } })
    : null;
  await prisma.dicomInstance.upsert({
    where: instanceKey,
    update: {
      seriesId: series.id,
      blobId: blob.id,
      instanceNumber: metadata.instanceNumber,
      rows: metadata.rows,
      columns: metadata.columns,
      frames: metadata.frames,
      transferSyntaxUid: metadata.transferSyntaxUid
    },
    create: {
      seriesId: series.id,
      blobId: blob.id,
      sopInstanceUid: metadata.sopInstanceUid,
      instanceNumber: metadata.instanceNumber,
      rows: metadata.rows,
      columns: metadata.columns,
      frames: metadata.frames,
      transferSyntaxUid: metadata.transferSyntaxUid
    }
  });
  if (source.logContentChange && !previousInstance) {
    await prisma.contentChange.create({
      data: {
        documentId: document.id,
        actorUserId: source.actorUserId,
        kind: "dicom_instance_added",
        details: {
          sopInstanceUid: metadata.sopInstanceUid,
          seriesInstanceUid: metadata.seriesInstanceUid
        }
      }
    });
  }
  const totals = await prisma.dicomInstance.aggregate({
    where: { series: { studyId: study.id } },
    _sum: { frames: true }
  });
  await prisma.document.update({
    where: { id: document.id },
    data: { indexStatus: "indexed", indexError: null, pageCount: totals._sum.frames ?? metadata.frames }
  });
  return { studyId: study.id, seriesId: series.id, metadata };
}

export async function indexDicomDocument(documentId: string) {
  const document = await prisma.document.findUnique({
    where: { id: documentId },
    select: {
      id: true,
      currentVersion: {
        select: { blob: { select: { checksum: true, size: true, storagePath: true, mimeType: true } } }
      }
    }
  });
  if (!document?.currentVersion) throw new Error("DICOM-Dokument oder aktuelle Version nicht gefunden.");
  return attachDicomInstance(document.id, document.currentVersion.blob);
}
