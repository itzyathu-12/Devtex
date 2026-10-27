export async function withLoadingState<T>(
  operation: () => Promise<T>,
  setLoading: (loading: boolean) => void
): Promise<T> {
  setLoading(true)
  try {
    return await operation()
  } finally {
    setLoading(false)
  }
}
