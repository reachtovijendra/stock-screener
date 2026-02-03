import { HttpInterceptorFn, HttpRequest, HttpHandlerFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError, retry, timer } from 'rxjs';
import { environment } from '../../../environments/environment';

/**
 * API interceptor for handling request/response processing
 * - Adds base URL to API calls
 * - Implements retry logic for transient failures
 * - Handles error responses
 */
export const apiInterceptor: HttpInterceptorFn = (req: HttpRequest<unknown>, next: HttpHandlerFn) => {
  // Only intercept API calls (not external URLs)
  if (req.url.startsWith('/api')) {
    const apiReq = req.clone({
      url: `${environment.apiBaseUrl}${req.url}`,
      setHeaders: {
        'Content-Type': 'application/json',
        'X-Request-Time': new Date().toISOString()
      }
    });

    return next(apiReq).pipe(
      // Retry failed requests up to 2 times with exponential backoff
      retry({
        count: 2,
        delay: (error, retryCount) => {
          // Only retry on network errors or 5xx server errors
          if (error instanceof HttpErrorResponse) {
            if (error.status === 0 || (error.status >= 500 && error.status < 600)) {
              console.warn(`Retrying request (attempt ${retryCount}):`, req.url);
              return timer(Math.pow(2, retryCount) * 1000); // Exponential backoff
            }
          }
          return throwError(() => error);
        }
      }),
      catchError((error: HttpErrorResponse) => {
        return throwError(() => handleError(error));
      })
    );
  }

  return next(req);
};

/**
 * Process HTTP errors into user-friendly messages
 */
function handleError(error: HttpErrorResponse): Error {
  let message: string;

  if (error.error instanceof ErrorEvent) {
    // Client-side error
    message = `Network error: ${error.error.message}`;
  } else {
    // Server-side error
    switch (error.status) {
      case 0:
        message = 'Unable to connect to the server. Please check your internet connection.';
        break;
      case 400:
        message = error.error?.message || 'Invalid request. Please check your filters.';
        break;
      case 401:
        message = 'Authentication required.';
        break;
      case 403:
        message = 'Access denied.';
        break;
      case 404:
        message = 'The requested resource was not found.';
        break;
      case 429:
        message = 'Too many requests. Please wait a moment and try again.';
        break;
      case 500:
        message = 'Server error. Please try again later.';
        break;
      case 502:
      case 503:
      case 504:
        message = 'Service temporarily unavailable. Please try again later.';
        break;
      default:
        message = error.error?.message || `Server error (${error.status})`;
    }
  }

  console.error('API Error:', {
    url: error.url,
    status: error.status,
    message: error.message,
    error: error.error
  });

  return new Error(message);
}
