export function extractLogs(liteSvmTxMetadataString: string): string[] {
  const logsMatch = liteSvmTxMetadataString.match(/logs: \[(.*?)\],/s)
  if (!logsMatch) return []

  return logsMatch[1].split('", "')
}
