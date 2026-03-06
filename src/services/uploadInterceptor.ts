// src/services/uploadInterceptor.ts
import imageCompression from 'browser-image-compression';

/**
 * Interceptor que otimiza arquivos antes do upload para Supabase.
 * Comprime imagens para reduzir tamanho e melhorar performance.
 */

interface CompressionOptions {
  /** Tamanho máximo em MB (default: 0.15 = 150KB) */
  maxSizeMB?: number;
  /** Dimensão máxima em pixels (default: 1920) */
  maxWidthOrHeight?: number;
  /** Formato de saída para imagens (default: 'image/jpeg') */
  fileType?: string;
  /** Usar web worker para não bloquear thread (default: true) */
  useWebWorker?: boolean;
}

/**
 * Processa um arquivo antes do upload:
 * - Comprime imagens automaticamente
 * - Mantém outros tipos de arquivo intactos
 *
 * @param file Arquivo a processar
 * @param options Opções de compressão
 * @returns Arquivo otimizado (ou original se não for imagem)
 */
export async function optimizeFileBeforeUpload(
  file: File,
  options: CompressionOptions = {}
): Promise<File> {
  const {
    maxSizeMB = 0.15,           // 150 KB
    maxWidthOrHeight = 1920,
    fileType = 'image/jpeg',
    useWebWorker = true,
  } = options;

  // Apenas comprime imagens
  if (!file.type.startsWith('image/')) {
    return file;
  }

  try {
    const compressedBlob = await imageCompression(file, {
      maxSizeMB,
      maxWidthOrHeight,
      useWebWorker,
      fileType,
    });

    // Converter Blob em File preservando o nome original
    const fileName = file.name;
    const compressedFile = new File([compressedBlob], fileName, {
      type: fileType,
      lastModified: Date.now(),
    });

    return compressedFile;
  } catch (error) {
    console.error('[optimizeFileBeforeUpload] Erro ao comprimir imagem:', error);
    // Retorna arquivo original em caso de erro
    return file;
  }
}

/**
 * Processa múltiplos arquivos
 */
export async function optimizeFilesBeforeUpload(
  files: File[],
  options: CompressionOptions = {}
): Promise<File[]> {
  return Promise.all(files.map(file => optimizeFileBeforeUpload(file, options)));
}
