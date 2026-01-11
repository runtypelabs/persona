/**
 * Feedback UI components for CSAT and NPS collection
 */

export type CSATFeedbackOptions = {
  /** Callback when user submits CSAT feedback */
  onSubmit: (rating: number, comment?: string) => void | Promise<void>;
  /** Callback when user dismisses the feedback form */
  onDismiss?: () => void;
  /** Title text */
  title?: string;
  /** Subtitle/question text */
  subtitle?: string;
  /** Placeholder for optional comment field */
  commentPlaceholder?: string;
  /** Submit button text */
  submitText?: string;
  /** Skip button text */
  skipText?: string;
  /** Show comment field */
  showComment?: boolean;
  /** Rating labels (5 items for ratings 1-5) */
  ratingLabels?: [string, string, string, string, string];
};

export type NPSFeedbackOptions = {
  /** Callback when user submits NPS feedback */
  onSubmit: (rating: number, comment?: string) => void | Promise<void>;
  /** Callback when user dismisses the feedback form */
  onDismiss?: () => void;
  /** Title text */
  title?: string;
  /** Subtitle/question text */
  subtitle?: string;
  /** Placeholder for optional comment field */
  commentPlaceholder?: string;
  /** Submit button text */
  submitText?: string;
  /** Skip button text */
  skipText?: string;
  /** Show comment field */
  showComment?: boolean;
  /** Low label (left side) */
  lowLabel?: string;
  /** High label (right side) */
  highLabel?: string;
};

const defaultCSATLabels: [string, string, string, string, string] = [
  'Very dissatisfied',
  'Dissatisfied',
  'Neutral',
  'Satisfied',
  'Very satisfied'
];

/**
 * Create a CSAT (Customer Satisfaction) feedback form
 * Rating scale: 1-5
 */
export function createCSATFeedback(options: CSATFeedbackOptions): HTMLElement {
  const {
    onSubmit,
    onDismiss,
    title = 'How satisfied are you?',
    subtitle = 'Please rate your experience',
    commentPlaceholder = 'Share your thoughts (optional)...',
    submitText = 'Submit',
    skipText = 'Skip',
    showComment = true,
    ratingLabels = defaultCSATLabels,
  } = options;

  const container = document.createElement('div');
  container.className = 'tvw-feedback-container tvw-feedback-csat';
  container.setAttribute('role', 'dialog');
  container.setAttribute('aria-label', 'Customer satisfaction feedback');

  let selectedRating: number | null = null;

  // Create inner content
  const content = document.createElement('div');
  content.className = 'tvw-feedback-content';

  // Header
  const header = document.createElement('div');
  header.className = 'tvw-feedback-header';
  
  const titleEl = document.createElement('h3');
  titleEl.className = 'tvw-feedback-title';
  titleEl.textContent = title;
  header.appendChild(titleEl);

  const subtitleEl = document.createElement('p');
  subtitleEl.className = 'tvw-feedback-subtitle';
  subtitleEl.textContent = subtitle;
  header.appendChild(subtitleEl);

  content.appendChild(header);

  // Rating buttons (1-5 stars or numbers)
  const ratingContainer = document.createElement('div');
  ratingContainer.className = 'tvw-feedback-rating tvw-feedback-rating-csat';
  ratingContainer.setAttribute('role', 'radiogroup');
  ratingContainer.setAttribute('aria-label', 'Satisfaction rating from 1 to 5');

  const ratingButtons: HTMLButtonElement[] = [];

  for (let i = 1; i <= 5; i++) {
    const ratingButton = document.createElement('button');
    ratingButton.type = 'button';
    ratingButton.className = 'tvw-feedback-rating-btn tvw-feedback-star-btn';
    ratingButton.setAttribute('role', 'radio');
    ratingButton.setAttribute('aria-checked', 'false');
    ratingButton.setAttribute('aria-label', `${i} star${i > 1 ? 's' : ''}: ${ratingLabels[i - 1]}`);
    ratingButton.title = ratingLabels[i - 1];
    ratingButton.dataset.rating = String(i);

    // Star icon (filled when selected)
    ratingButton.innerHTML = `
      <svg class="tvw-feedback-star" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
      </svg>
    `;

    ratingButton.addEventListener('click', () => {
      selectedRating = i;
      ratingButtons.forEach((btn, index) => {
        const isSelected = index < i;
        btn.classList.toggle('selected', isSelected);
        btn.setAttribute('aria-checked', index === i - 1 ? 'true' : 'false');
      });
    });

    ratingButtons.push(ratingButton);
    ratingContainer.appendChild(ratingButton);
  }

  content.appendChild(ratingContainer);

  // Comment field
  let commentTextarea: HTMLTextAreaElement | null = null;
  if (showComment) {
    const commentContainer = document.createElement('div');
    commentContainer.className = 'tvw-feedback-comment-container';
    
    commentTextarea = document.createElement('textarea');
    commentTextarea.className = 'tvw-feedback-comment';
    commentTextarea.placeholder = commentPlaceholder;
    commentTextarea.rows = 3;
    commentTextarea.setAttribute('aria-label', 'Additional comments');
    
    commentContainer.appendChild(commentTextarea);
    content.appendChild(commentContainer);
  }

  // Action buttons
  const actions = document.createElement('div');
  actions.className = 'tvw-feedback-actions';

  const skipButton = document.createElement('button');
  skipButton.type = 'button';
  skipButton.className = 'tvw-feedback-btn tvw-feedback-btn-skip';
  skipButton.textContent = skipText;
  skipButton.addEventListener('click', () => {
    onDismiss?.();
    container.remove();
  });

  const submitButton = document.createElement('button');
  submitButton.type = 'button';
  submitButton.className = 'tvw-feedback-btn tvw-feedback-btn-submit';
  submitButton.textContent = submitText;
  submitButton.addEventListener('click', async () => {
    if (selectedRating === null) {
      // Shake the rating container to indicate selection required
      ratingContainer.classList.add('tvw-feedback-shake');
      setTimeout(() => ratingContainer.classList.remove('tvw-feedback-shake'), 500);
      return;
    }
    
    submitButton.disabled = true;
    submitButton.textContent = 'Submitting...';
    
    try {
      const comment = commentTextarea?.value.trim() || undefined;
      await onSubmit(selectedRating, comment);
      container.remove();
    } catch (error) {
      submitButton.disabled = false;
      submitButton.textContent = submitText;
      // eslint-disable-next-line no-console
      console.error('[CSAT Feedback] Failed to submit:', error);
    }
  });

  actions.appendChild(skipButton);
  actions.appendChild(submitButton);
  content.appendChild(actions);

  container.appendChild(content);

  return container;
}

/**
 * Create an NPS (Net Promoter Score) feedback form
 * Rating scale: 0-10
 */
export function createNPSFeedback(options: NPSFeedbackOptions): HTMLElement {
  const {
    onSubmit,
    onDismiss,
    title = 'How likely are you to recommend us?',
    subtitle = 'On a scale of 0 to 10',
    commentPlaceholder = 'What could we do better? (optional)...',
    submitText = 'Submit',
    skipText = 'Skip',
    showComment = true,
    lowLabel = 'Not likely',
    highLabel = 'Very likely',
  } = options;

  const container = document.createElement('div');
  container.className = 'tvw-feedback-container tvw-feedback-nps';
  container.setAttribute('role', 'dialog');
  container.setAttribute('aria-label', 'Net Promoter Score feedback');

  let selectedRating: number | null = null;

  // Create inner content
  const content = document.createElement('div');
  content.className = 'tvw-feedback-content';

  // Header
  const header = document.createElement('div');
  header.className = 'tvw-feedback-header';
  
  const titleEl = document.createElement('h3');
  titleEl.className = 'tvw-feedback-title';
  titleEl.textContent = title;
  header.appendChild(titleEl);

  const subtitleEl = document.createElement('p');
  subtitleEl.className = 'tvw-feedback-subtitle';
  subtitleEl.textContent = subtitle;
  header.appendChild(subtitleEl);

  content.appendChild(header);

  // Rating buttons (0-10)
  const ratingContainer = document.createElement('div');
  ratingContainer.className = 'tvw-feedback-rating tvw-feedback-rating-nps';
  ratingContainer.setAttribute('role', 'radiogroup');
  ratingContainer.setAttribute('aria-label', 'Likelihood rating from 0 to 10');

  // Labels row
  const labelsRow = document.createElement('div');
  labelsRow.className = 'tvw-feedback-labels';
  
  const lowLabelEl = document.createElement('span');
  lowLabelEl.className = 'tvw-feedback-label-low';
  lowLabelEl.textContent = lowLabel;
  
  const highLabelEl = document.createElement('span');
  highLabelEl.className = 'tvw-feedback-label-high';
  highLabelEl.textContent = highLabel;
  
  labelsRow.appendChild(lowLabelEl);
  labelsRow.appendChild(highLabelEl);
  
  // Numbers row
  const numbersRow = document.createElement('div');
  numbersRow.className = 'tvw-feedback-numbers';

  const ratingButtons: HTMLButtonElement[] = [];

  for (let i = 0; i <= 10; i++) {
    const ratingButton = document.createElement('button');
    ratingButton.type = 'button';
    ratingButton.className = 'tvw-feedback-rating-btn tvw-feedback-number-btn';
    ratingButton.setAttribute('role', 'radio');
    ratingButton.setAttribute('aria-checked', 'false');
    ratingButton.setAttribute('aria-label', `Rating ${i} out of 10`);
    ratingButton.textContent = String(i);
    ratingButton.dataset.rating = String(i);

    // Color coding: detractors (0-6), passives (7-8), promoters (9-10)
    if (i <= 6) {
      ratingButton.classList.add('tvw-feedback-detractor');
    } else if (i <= 8) {
      ratingButton.classList.add('tvw-feedback-passive');
    } else {
      ratingButton.classList.add('tvw-feedback-promoter');
    }

    ratingButton.addEventListener('click', () => {
      selectedRating = i;
      ratingButtons.forEach((btn, index) => {
        btn.classList.toggle('selected', index === i);
        btn.setAttribute('aria-checked', index === i ? 'true' : 'false');
      });
    });

    ratingButtons.push(ratingButton);
    numbersRow.appendChild(ratingButton);
  }

  ratingContainer.appendChild(labelsRow);
  ratingContainer.appendChild(numbersRow);
  content.appendChild(ratingContainer);

  // Comment field
  let commentTextarea: HTMLTextAreaElement | null = null;
  if (showComment) {
    const commentContainer = document.createElement('div');
    commentContainer.className = 'tvw-feedback-comment-container';
    
    commentTextarea = document.createElement('textarea');
    commentTextarea.className = 'tvw-feedback-comment';
    commentTextarea.placeholder = commentPlaceholder;
    commentTextarea.rows = 3;
    commentTextarea.setAttribute('aria-label', 'Additional comments');
    
    commentContainer.appendChild(commentTextarea);
    content.appendChild(commentContainer);
  }

  // Action buttons
  const actions = document.createElement('div');
  actions.className = 'tvw-feedback-actions';

  const skipButton = document.createElement('button');
  skipButton.type = 'button';
  skipButton.className = 'tvw-feedback-btn tvw-feedback-btn-skip';
  skipButton.textContent = skipText;
  skipButton.addEventListener('click', () => {
    onDismiss?.();
    container.remove();
  });

  const submitButton = document.createElement('button');
  submitButton.type = 'button';
  submitButton.className = 'tvw-feedback-btn tvw-feedback-btn-submit';
  submitButton.textContent = submitText;
  submitButton.addEventListener('click', async () => {
    if (selectedRating === null) {
      // Shake the rating container to indicate selection required
      numbersRow.classList.add('tvw-feedback-shake');
      setTimeout(() => numbersRow.classList.remove('tvw-feedback-shake'), 500);
      return;
    }
    
    submitButton.disabled = true;
    submitButton.textContent = 'Submitting...';
    
    try {
      const comment = commentTextarea?.value.trim() || undefined;
      await onSubmit(selectedRating, comment);
      container.remove();
    } catch (error) {
      submitButton.disabled = false;
      submitButton.textContent = submitText;
      // eslint-disable-next-line no-console
      console.error('[NPS Feedback] Failed to submit:', error);
    }
  });

  actions.appendChild(skipButton);
  actions.appendChild(submitButton);
  content.appendChild(actions);

  container.appendChild(content);

  return container;
}



