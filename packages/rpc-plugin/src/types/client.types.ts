/**
 * Clean separation of concerns for request options
 */
export type RequestOptions<TParams = never, TQuery = never, TBody = never, THeaders = never> =
	// params
	(TParams extends never ? { params?: never } : { params: TParams }) &
		// query
		(TQuery extends never ? { query?: never } : { query?: TQuery }) &
		// body
		(TBody extends never ? { body?: never } : { body: TBody }) &
		// headers
		(THeaders extends never ? { headers?: never } : { headers: THeaders })

/**
 * Custom fetch function type that matches the standard fetch API
 */
export type FetchFunction = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

/**
 * API Response wrapper
 */
export interface ApiResponse<T = any> {
	data: T
	message?: string
	success: boolean
}

/**
 * API Error class
 */
export class ApiError extends Error {
	constructor(
		public statusCode: number,
		message: string
	) {
		super(message)
		this.name = 'ApiError'
	}
}
