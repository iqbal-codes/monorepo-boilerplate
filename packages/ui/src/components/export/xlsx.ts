/**
 * OOXML `.xlsx` export adapter for the Export block.
 *
 * Delegates workbook generation to `@monorepo-boilerplate/ui/lib/xlsx` so
 * template downloads and Customer exports share one tested OOXML writer.
 */
import { XLSX_MIME_TYPE, buildXlsx, type XlsxWorkbookPayload } from "../../lib/xlsx";
import {
  decodeCsvExportPayload,
  type CsvExportPayloadRequest,
  type CsvExportResponse,
} from "./csv";

export { XLSX_MIME_TYPE, buildXlsx };
export type { XlsxWorkbookPayload };

/** Worker body: decode, validate, and generate a single compressed `.xlsx` File response. */
export async function runXlsxExport({
  payload,
  filename,
}: Omit<CsvExportPayloadRequest, "format">): Promise<CsvExportResponse> {
  try {
    const decoded = decodeCsvExportPayload(payload);
    const bytes = await buildXlsx(decoded);
    const file = new File([bytes], filename, { type: XLSX_MIME_TYPE });
    return { type: "done", file, rowCount: decoded.rows.length };
  } catch (cause) {
    return {
      type: "error",
      message: cause instanceof Error ? cause.message : "Could not build the Excel file.",
    };
  }
}
