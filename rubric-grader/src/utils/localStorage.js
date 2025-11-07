/**
 * LocalStorage utility functions for persisting rubrics and grading sessions
 */

const STORAGE_KEYS = {
  RUBRICS: 'hotrubric_rubrics',
  COURSES: 'hotrubric_courses',
  CURRENT_SESSION: 'hotrubric_current_session',
  FEEDBACK_HISTORY: 'hotrubric_feedback_history',
};

/**
 * Get all saved rubrics
 * @returns {Object} Map of courseId -> rubrics
 */
export const getAllRubrics = () => {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.RUBRICS);
    return data ? JSON.parse(data) : {};
  } catch (error) {
    console.error('Error reading rubrics from localStorage:', error);
    return {};
  }
};

/**
 * Get rubrics for a specific course
 * @param {string} courseId
 * @returns {Array} Array of rubrics
 */
export const getRubricsByCourse = (courseId) => {
  const allRubrics = getAllRubrics();
  return allRubrics[courseId] || [];
};

/**
 * Save a rubric for a specific course
 * @param {string} courseId
 * @param {Object} rubric
 */
export const saveRubric = (courseId, rubric) => {
  try {
    const allRubrics = getAllRubrics();
    if (!allRubrics[courseId]) {
      allRubrics[courseId] = [];
    }
    
    // Check if rubric with same name exists, replace it
    const existingIndex = allRubrics[courseId].findIndex(r => r.name === rubric.name);
    if (existingIndex >= 0) {
      allRubrics[courseId][existingIndex] = rubric;
    } else {
      allRubrics[courseId].push(rubric);
    }
    
    localStorage.setItem(STORAGE_KEYS.RUBRICS, JSON.stringify(allRubrics));
  } catch (error) {
    console.error('Error saving rubric to localStorage:', error);
  }
};

/**
 * Delete a rubric from a course
 * @param {string} courseId
 * @param {string} rubricName
 */
export const deleteRubric = (courseId, rubricName) => {
  try {
    const allRubrics = getAllRubrics();
    if (allRubrics[courseId]) {
      allRubrics[courseId] = allRubrics[courseId].filter(r => r.name !== rubricName);
      localStorage.setItem(STORAGE_KEYS.RUBRICS, JSON.stringify(allRubrics));
    }
  } catch (error) {
    console.error('Error deleting rubric from localStorage:', error);
  }
};

/**
 * Get all course IDs
 * @returns {Array} Array of course IDs
 */
export const getAllCourses = () => {
  const allRubrics = getAllRubrics();
  return Object.keys(allRubrics);
};

/**
 * Save current grading session
 * @param {Object} session
 */
export const saveCurrentSession = (session) => {
  try {
    localStorage.setItem(STORAGE_KEYS.CURRENT_SESSION, JSON.stringify(session));
  } catch (error) {
    console.error('Error saving session to localStorage:', error);
  }
};

/**
 * Get current grading session
 * @returns {Object|null}
 */
export const getCurrentSession = () => {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.CURRENT_SESSION);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    console.error('Error reading session from localStorage:', error);
    return null;
  }
};

/**
 * Clear current session
 */
export const clearCurrentSession = () => {
  try {
    localStorage.removeItem(STORAGE_KEYS.CURRENT_SESSION);
  } catch (error) {
    console.error('Error clearing session from localStorage:', error);
  }
};

/**
 * Save feedback to history (keeps last 5)
 * @param {string} feedbackText
 * @param {string} rubricName
 */
export const saveFeedbackToHistory = (feedbackText, rubricName) => {
  try {
    const history = getFeedbackHistory();
    const newEntry = {
      id: Date.now().toString(),
      text: feedbackText,
      rubricName,
      timestamp: new Date().toISOString(),
    };
    
    // Add to beginning and keep only last 5
    history.unshift(newEntry);
    const trimmedHistory = history.slice(0, 5);
    
    localStorage.setItem(STORAGE_KEYS.FEEDBACK_HISTORY, JSON.stringify(trimmedHistory));
  } catch (error) {
    console.error('Error saving feedback to history:', error);
  }
};

/**
 * Get feedback history
 * @returns {Array} Array of feedback entries
 */
export const getFeedbackHistory = () => {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.FEEDBACK_HISTORY);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error('Error reading feedback history from localStorage:', error);
    return [];
  }
};

/**
 * Clear feedback history
 */
export const clearFeedbackHistory = () => {
  try {
    localStorage.removeItem(STORAGE_KEYS.FEEDBACK_HISTORY);
  } catch (error) {
    console.error('Error clearing feedback history from localStorage:', error);
  }
};

