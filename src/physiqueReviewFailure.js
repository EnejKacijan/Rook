// Technical failures say nothing about photo quality. Only a successful
// provider response with status "insufficient" can ask for clearer photos.
export function physiqueReviewUnavailableError(status = {}) {
  return Object.assign(new Error('Photo review is unavailable.'), {
    code: status.reason || 'config_missing',
    status: status.status,
    retryAt: status.retryAt,
  });
}

export function physiqueReviewFailureCopy(error = {}, { photosSelected = true } = {}) {
  const code = error.code;
  const retryMessage = photosSelected
    ? 'Your selected photos are still here. Try again with the same photos, or choose priorities yourself.'
    : 'Check again later, or choose your training priorities yourself.';
  if (code === 'config_missing' || code === 'ai-disabled') return {
    title: 'Photo review is not available for this app yet.',
    message: 'Choose your training priorities yourself, or check again later.',
    action: 'CHECK AGAIN',
    checkAvailability: true,
  };
  if (code === 'sign-in-required' || code === 'invalid-identity' || code === 'auth-failed'
      || (code?.startsWith('auth/') && code !== 'auth/network-request-failed')
      || error.status === 401 || error.status === 403) return {
    title: 'Sign in to use photo review.',
    message: 'Sign in to ROOK, then try again. You can also choose your training priorities yourself.',
    action: 'TRY AGAIN',
  };
  if (error.status === 429) return {
    title: 'Photo review’s usage limit was reached.',
    message: 'Try again later, or choose your training priorities yourself.',
    action: 'TRY AGAIN',
  };
  if (code === 'timeout' || error.name === 'AbortError') return {
    title: 'Photo review took too long.',
    message: retryMessage,
    action: 'TRY AGAIN',
  };
  if (code === 'network_error' || code === 'auth/network-request-failed' || error instanceof TypeError) return {
    title: 'Photo review could not connect.',
    message: `Check your connection and try again.${photosSelected ? ' Your selected photos are still here.' : ''}`,
    action: 'TRY AGAIN',
  };
  if (error.status === 413) return {
    title: 'These photos are too large to review together.',
    message: 'Choose smaller photos and try again, or choose your training priorities yourself.',
    action: 'CHANGE PHOTOS',
    changePhotos: true,
  };
  return {
    title: 'Photo review is temporarily unavailable.',
    message: retryMessage,
    action: 'TRY AGAIN',
  };
}
