/**
 * Clean separation of concerns for request options
 */
export type RequestOptions<
	TParams = undefined,
	TQuery = undefined,
	TBody = undefined,
	THeaders = undefined
> = (TParams extends undefined ? object : { params: TParams }) &
	(TQuery extends undefined ? object : { query: TQuery }) &
	(TBody extends undefined ? object : { body: TBody }) &
	(THeaders extends undefined ? object : { headers: THeaders })

/**
 * Custom fetch function type that matches the standard fetch API
 */
export type FetchFunction = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

/**
 * Intercepts and can mutate outgoing requests.
 */
export type RequestInterceptor = (
	url: string,
	init: RequestInit
) => { url: string; init: RequestInit } | Promise<{ url: string; init: RequestInit }>

/**
 * Intercepts incoming responses before payload handling.
 */
export type ResponseInterceptor = (response: Response) => Response | Promise<Response>

/**
 * API Error class
 */
export class ApiError<ResponseData = any> extends Error {
	constructor(
		public statusCode: number,
		message: string,
		public responseData?: ResponseData
	) {
		super(message)
		this.name = 'ApiError'
	}
}
