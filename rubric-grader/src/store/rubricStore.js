import { create } from 'zustand';
import {
  saveRubric as saveRubricToStorage,
  deleteRubric as deleteRubricFromStorage,
  getRubricsByCourse,
  getAllCourses,
  saveCurrentSession,
  getCurrentSession,
  clearCurrentSession,
  saveRubricState,
  getRubricState,
} from '../utils/localStorage';
import { calculateTotalPoints } from '../utils/csvParser';

// Debounce utility for saveSession
let saveSessionTimeout = null;
const debounceSaveSession = (fn, delay = 500) => {
  return (...args) => {
    if (saveSessionTimeout) {
      clearTimeout(saveSessionTimeout);
    }
    saveSessionTimeout = setTimeout(() => {
      fn(...args);
      saveSessionTimeout = null;
    }, delay);
  };
};

const selectMaxLevels = (rubric) => {
  if (!rubric) return rubric;

  const updatedCriteria = (rubric.criteria || []).map((criterion) => {
    if (!criterion?.levels?.length) {
      return {
        ...criterion,
        selectedLevel: null,
      };
    }

    let maxIndex = 0;
    let maxPoints = Number(criterion.levels[0]?.points) || 0;

    criterion.levels.forEach((level, index) => {
      const points = Number(level?.points) || 0;
      if (points > maxPoints) {
        maxPoints = points;
        maxIndex = index;
      }
    });

    return {
      ...criterion,
      selectedLevel: maxIndex,
    };
  });

  return {
    ...rubric,
    criteria: updatedCriteria,
  };
};

const useRubricStore = create((set, get) => ({
  // Current state
  currentCourse: null,
  currentRubric: null,
  currentCriterionIndex: 0,
  availableCourses: [],
  availableRubrics: [],
  autoAdvance: true,
  correctByDefault: false,

  // Initialize store
  initialize: () => {
    let courses = getAllCourses();
    
    // Try to restore previous session
    const session = getCurrentSession();
    if (session && session.currentCourse) {
      // Ensure the restored course is in the available courses list
      if (!courses.includes(session.currentCourse)) {
        courses.push(session.currentCourse);
      }
      
      set({
        availableCourses: courses,
        currentCourse: session.currentCourse,
        currentRubric: session.currentRubric && {
          feedbackLabel: '',
          ...session.currentRubric,
        },
        currentCriterionIndex: session.currentCriterionIndex || 0,
        autoAdvance: session.autoAdvance !== undefined ? session.autoAdvance : true,
        correctByDefault: session.correctByDefault !== undefined ? session.correctByDefault : false,
      });
      
      get().loadRubricsForCourse(session.currentCourse);
      if (session.correctByDefault && session.currentRubric) {
        set((state) => ({ currentRubric: selectMaxLevels(state.currentRubric) }));
      }
    } else {
      set({ availableCourses: courses });
    }
  },

  // Course management
  selectCourse: (courseId) => {
    set({ currentCourse: courseId, currentRubric: null, currentCriterionIndex: 0 });
    get().loadRubricsForCourse(courseId);
    get().saveSession();
  },

  addCourse: (courseId) => {
    const courses = [...get().availableCourses];
    if (!courses.includes(courseId)) {
      courses.push(courseId);
      set({ availableCourses: courses });
    }
  },

  loadRubricsForCourse: (courseId) => {
    const rubrics = getRubricsByCourse(courseId);
    set({ availableRubrics: rubrics });
  },

  // Rubric management
  selectRubric: (rubricName) => {
    const rubric = get().availableRubrics.find(r => r.name === rubricName);
    if (rubric) {
      // Create a fresh copy for grading
      let rubricCopy = JSON.parse(JSON.stringify(rubric));
      if (typeof rubricCopy.feedbackLabel !== 'string') {
        rubricCopy.feedbackLabel = '';
      }
      const { correctByDefault } = get();
      if (correctByDefault) {
        rubricCopy = selectMaxLevels(rubricCopy);
      }
      set({ currentRubric: rubricCopy, currentCriterionIndex: 0 });
      get().saveSession();
      get().persistCurrentRubric();
    }
  },

  importRubric: (rubric) => {
    const { currentCourse, correctByDefault } = get();
    if (!currentCourse) {
      throw new Error('Please select a course first');
    }
    
    let rubricWithLabel = {
      feedbackLabel: '',
      ...rubric,
    };
    if (correctByDefault) {
      rubricWithLabel = selectMaxLevels(rubricWithLabel);
    }
    saveRubricToStorage(currentCourse, rubricWithLabel);
    get().loadRubricsForCourse(currentCourse);
    
    // Auto-select the newly imported rubric
    set({ currentRubric: rubricWithLabel, currentCriterionIndex: 0 });
    get().saveSession();
  },

  // Create a new rubric with a single criterion and one level
  createRubric: (name) => {
    const { currentCourse, correctByDefault } = get();
    if (!currentCourse) {
      throw new Error('Please select a course first');
    }

    const newRubric = {
      name: name || 'New Rubric',
      feedbackLabel: '',
      criteria: [
        {
          name: 'Criterion 1',
          description: '',
          enableRange: '',
          levels: [
            {
              name: 'Level 1',
              description: '',
              points: 0,
            },
          ],
          selectedLevel: null,
          comment: '',
        },
      ],
      createdAt: new Date().toISOString(),
    };

    if (correctByDefault) {
      const rubricWithDefaults = selectMaxLevels(newRubric);
      saveRubricToStorage(currentCourse, rubricWithDefaults);
      get().loadRubricsForCourse(currentCourse);
      set({ currentRubric: rubricWithDefaults, currentCriterionIndex: 0 });
    } else {
      saveRubricToStorage(currentCourse, newRubric);
      get().loadRubricsForCourse(currentCourse);
      set({ currentRubric: newRubric, currentCriterionIndex: 0 });
    }
    get().saveSession();
  },

  // Rename a rubric
  renameRubric: (oldName, newName) => {
    const { currentCourse, availableRubrics } = get();
    if (!currentCourse) {
      throw new Error('Please select a course first');
    }

    if (!newName || newName.trim() === '') {
      throw new Error('Rubric name cannot be empty');
    }

    const trimmedName = newName.trim();
    const rubric = availableRubrics.find(r => r.name === oldName);
    if (!rubric) {
      throw new Error('Rubric not found');
    }

    // Check if new name already exists
    if (availableRubrics.some(r => r.name === trimmedName && r.name !== oldName)) {
      throw new Error('A rubric with this name already exists');
    }

    // Update rubric name
    const updatedRubric = {
      ...rubric,
      name: trimmedName,
    };

    // Delete old rubric and save with new name
    deleteRubricFromStorage(currentCourse, oldName);
    saveRubricToStorage(currentCourse, updatedRubric);
    get().loadRubricsForCourse(currentCourse);

    // Update current rubric if it was the renamed one
    const { currentRubric } = get();
    if (currentRubric && currentRubric.name === oldName) {
      set({ currentRubric: updatedRubric });
      get().saveSession();
    }
  },

  // Duplicate a rubric
  duplicateRubric: (rubricName, newName) => {
    const { currentCourse, correctByDefault } = get();
    if (!currentCourse) {
      throw new Error('Please select a course first');
    }

    const rubric = get().availableRubrics.find(r => r.name === rubricName);
    if (!rubric) {
      throw new Error('Rubric not found');
    }

    if (!newName || newName.trim() === '') {
      throw new Error('Rubric name cannot be empty');
    }

    const trimmedName = newName.trim();
    
    // Check if name already exists
    if (get().availableRubrics.some(r => r.name === trimmedName)) {
      throw new Error('A rubric with this name already exists');
    }

    // Create a deep copy of the rubric
    const duplicatedRubric = JSON.parse(JSON.stringify(rubric));
    duplicatedRubric.name = trimmedName;
    duplicatedRubric.createdAt = new Date().toISOString();
    // Reset grading state
    duplicatedRubric.criteria = duplicatedRubric.criteria.map(criterion => ({
      ...criterion,
      selectedLevel: null,
      comment: '',
    }));
    duplicatedRubric.feedbackLabel = '';

    if (correctByDefault) {
      const rubricWithDefaults = selectMaxLevels(duplicatedRubric);
      saveRubricToStorage(currentCourse, rubricWithDefaults);
      get().loadRubricsForCourse(currentCourse);
      set({ currentRubric: rubricWithDefaults, currentCriterionIndex: 0 });
    } else {
      saveRubricToStorage(currentCourse, duplicatedRubric);
      get().loadRubricsForCourse(currentCourse);
      set({ currentRubric: duplicatedRubric, currentCriterionIndex: 0 });
    }
    get().saveSession();
  },

  updateFeedbackLabel: (label) => {
    const { currentRubric } = get();
    if (!currentRubric) return;

    const updatedRubric = {
      ...currentRubric,
      feedbackLabel: label,
    };

    set({ currentRubric: updatedRubric });
    get().saveSession();
    get().persistCurrentRubric();
  },

  // Grading actions
  selectLevel: (criterionIndex, levelIndex) => {
    const { currentRubric, saveSessionDebounced } = get();
    if (!currentRubric) return;

    const updatedRubric = { ...currentRubric };
    updatedRubric.criteria[criterionIndex].selectedLevel = levelIndex;
    set({ currentRubric: updatedRubric });
    // Use debounced save for frequent updates
    if (saveSessionDebounced) {
      saveSessionDebounced();
    } else {
      get().saveSession();
    }
  },

  updateComment: (criterionIndex, comment) => {
    const { currentRubric, saveSessionDebounced } = get();
    if (!currentRubric) return;

    const updatedRubric = { ...currentRubric };
    updatedRubric.criteria[criterionIndex].comment = comment;
    set({ currentRubric: updatedRubric });
    // Use debounced save to avoid saving on every keystroke
    if (saveSessionDebounced) {
      saveSessionDebounced();
    } else {
      get().saveSession();
    }
  },

  addLevel: (criterionIndex, levelData) => {
    const { currentRubric } = get();
    if (!currentRubric) return;

    const updatedRubric = { ...currentRubric };
    const updatedCriteria = [...updatedRubric.criteria];
    const criterion = updatedCriteria[criterionIndex];
    if (!criterion) return;

    const levels = [...(criterion.levels || [])];
    const selectedLevelRef =
      criterion.selectedLevel !== null && criterion.selectedLevel !== undefined
        ? levels[criterion.selectedLevel]
        : null;

    const newLevel = {
      name: levelData?.name?.trim() || '',
      description: levelData?.description?.trim() || '',
      points: Number(levelData?.points) || 0,
    };

    levels.push(newLevel);
    levels.sort((a, b) => b.points - a.points);

    const nextSelectedLevel =
      selectedLevelRef && levels.includes(selectedLevelRef)
        ? levels.indexOf(selectedLevelRef)
        : selectedLevelRef === null
          ? null
          : null;

    updatedCriteria[criterionIndex] = {
      ...criterion,
      levels,
      selectedLevel: nextSelectedLevel,
    };

    updatedRubric.criteria = updatedCriteria;
    set({ currentRubric: updatedRubric });
    get().saveSession();
    get().persistCurrentRubric();
  },

  updateLevel: (criterionIndex, levelIndex, updates) => {
    const { currentRubric } = get();
    if (!currentRubric) return;

    const updatedRubric = { ...currentRubric };
    const updatedCriteria = [...updatedRubric.criteria];
    const criterion = updatedCriteria[criterionIndex];
    if (!criterion) return;

    const levels = [...(criterion.levels || [])];
    if (!levels[levelIndex]) return;

    levels[levelIndex] = {
      ...levels[levelIndex],
      ...updates,
      name: updates?.name?.trim() ?? levels[levelIndex].name ?? '',
      description: updates?.description?.trim() ?? levels[levelIndex].description ?? '',
      points:
        updates?.points !== undefined && updates?.points !== null
          ? Number(updates.points)
          : Number(levels[levelIndex].points) || 0,
    };

    const selectedLevelRef =
      criterion.selectedLevel !== null && criterion.selectedLevel !== undefined
        ? levels[criterion.selectedLevel]
        : null;

    const editedLevelRef = levels[levelIndex];
    levels.sort((a, b) => b.points - a.points);

    let nextSelectedLevel = null;
    if (selectedLevelRef && levels.includes(selectedLevelRef)) {
      nextSelectedLevel = levels.indexOf(selectedLevelRef);
    }

    updatedCriteria[criterionIndex] = {
      ...criterion,
      levels,
      selectedLevel: nextSelectedLevel,
    };

    updatedRubric.criteria = updatedCriteria;
    set({ currentRubric: updatedRubric });
    get().saveSession();
    get().persistCurrentRubric();

    return levels.indexOf(editedLevelRef);
  },

  deleteLevel: (criterionIndex, levelIndex) => {
    const { currentRubric } = get();
    if (!currentRubric) return;

    const updatedRubric = { ...currentRubric };
    const updatedCriteria = [...updatedRubric.criteria];
    const criterion = updatedCriteria[criterionIndex];
    if (!criterion) return;

    const levels = [...(criterion.levels || [])];
    if (!levels[levelIndex]) return;

    levels.splice(levelIndex, 1);

    let nextSelectedLevel = null;
    const currentSelected = criterion.selectedLevel;

    if (currentSelected !== null && currentSelected !== undefined) {
      if (levels.length === 0) {
        nextSelectedLevel = null;
      } else if (currentSelected === levelIndex) {
        nextSelectedLevel = null;
      } else if (currentSelected > levelIndex) {
        nextSelectedLevel = currentSelected - 1;
      } else {
        nextSelectedLevel = currentSelected;
      }
    }

    updatedCriteria[criterionIndex] = {
      ...criterion,
      levels,
      selectedLevel: nextSelectedLevel,
    };

    updatedRubric.criteria = updatedCriteria;
    set({ currentRubric: updatedRubric });
    get().saveSession();
    get().persistCurrentRubric();
  },

  replaceCriteria: (newCriteria) => {
    const state = get();
    const { currentRubric, currentCriterionIndex, correctByDefault } = state;
    if (!currentRubric || !Array.isArray(newCriteria)) return;

    const sanitizedCriteria = newCriteria.map((criterion) => ({
      name: criterion?.name || '',
      description: criterion?.description || '',
      enableRange: criterion?.enableRange || '',
      levels: Array.isArray(criterion?.levels)
        ? criterion.levels.map((level) => ({
            name: level?.name || '',
            description: level?.description || '',
            points:
              level?.points !== undefined && level?.points !== null
                ? Number(level.points)
                : 0,
          }))
        : [],
      selectedLevel:
        criterion?.selectedLevel !== undefined
          ? criterion.selectedLevel
          : null,
      comment: criterion?.comment || '',
    }));

    const nextIndex =
      sanitizedCriteria.length === 0
        ? 0
        : Math.min(currentCriterionIndex || 0, sanitizedCriteria.length - 1);

    const updatedRubric = {
      ...currentRubric,
      criteria: sanitizedCriteria,
    };

    set({
      currentRubric: updatedRubric,
      currentCriterionIndex: nextIndex,
    });
    state.saveSession();
    state.persistCurrentRubric();
    if (correctByDefault) {
      state.applyCorrectByDefault();
    }
  },

  // Navigation
  goToNextCriterion: () => {
    const { currentRubric, currentCriterionIndex } = get();
    if (!currentRubric) return;

    if (currentCriterionIndex < currentRubric.criteria.length - 1) {
      set({ currentCriterionIndex: currentCriterionIndex + 1 });
      get().saveSession();
    }
  },

  goToPreviousCriterion: () => {
    const { currentCriterionIndex } = get();
    if (currentCriterionIndex > 0) {
      set({ currentCriterionIndex: currentCriterionIndex - 1 });
      get().saveSession();
    }
  },

  // Navigation with auto-advance check (used by space bar hotkey)
  goToNextCriterionIfNotAutoAdvance: () => {
    const { autoAdvance, currentRubric, currentCriterionIndex } = get();
    if (!autoAdvance && currentRubric) {
      if (currentCriterionIndex < currentRubric.criteria.length - 1) {
        set({ currentCriterionIndex: currentCriterionIndex + 1 });
        get().saveSession();
      }
    }
  },

  goToCriterion: (index) => {
    const { currentRubric } = get();
    if (!currentRubric) return;

    if (index >= 0 && index < currentRubric.criteria.length) {
      set({ currentCriterionIndex: index });
      get().saveSession();
    }
  },

  setAutoAdvance: (value) => {
    set({ autoAdvance: value });
    get().saveSession();
  },

  setCorrectByDefault: (value) => {
    set({ correctByDefault: value });
    if (value) {
      get().applyCorrectByDefault();
    }
    get().saveSession();
  },

  // Session management
  saveSession: () => {
    const { currentCourse, currentRubric, currentCriterionIndex, autoAdvance, correctByDefault } = get();
    saveCurrentSession({
      currentCourse,
      currentRubric,
      currentCriterionIndex,
      autoAdvance,
      correctByDefault,
    });
  },

  // Debounced version of saveSession for frequent updates like typing
  saveSessionDebounced: null, // Will be initialized below

  resetGrading: () => {
    const { currentRubric, correctByDefault, applyCorrectByDefault } = get();
    if (!currentRubric) return;

    // Reset all selections and comments
    let resetRubric = { ...currentRubric };
    resetRubric.criteria = resetRubric.criteria.map(criterion => ({
      ...criterion,
      selectedLevel: null,
      comment: '',
    }));
    resetRubric.feedbackLabel = '';

    if (correctByDefault) {
      resetRubric = selectMaxLevels(resetRubric);
    }

    set({ currentRubric: resetRubric, currentCriterionIndex: 0 });
    get().saveSession();
    get().persistCurrentRubric();
  },

  clearSession: () => {
    clearCurrentSession();
    set({ 
      currentRubric: null, 
      currentCriterionIndex: 0 
    });
  },

  // Computed values
  getTotalPoints: () => {
    const { currentRubric } = get();
    if (!currentRubric) return { earned: 0, possible: 0 };
    return calculateTotalPoints(currentRubric);
  },

  applyCorrectByDefault: () => {
    const { currentRubric, correctByDefault } = get();
    if (!correctByDefault || !currentRubric) return;
    const updatedRubric = selectMaxLevels(currentRubric);
    set({ currentRubric: updatedRubric });
    get().persistCurrentRubric();
    get().saveSession();
  },

  persistCurrentRubric: () => {
    const { currentRubric, currentCourse, availableRubrics, loadRubricsForCourse } = get();
    if (!currentRubric || !currentCourse) return;

    const rubricCopy = JSON.parse(JSON.stringify({
      feedbackLabel: currentRubric.feedbackLabel || '',
      ...currentRubric,
    }));

    saveRubricToStorage(currentCourse, rubricCopy);

    const updatedRubrics = [...availableRubrics];
    const existingIndex = updatedRubrics.findIndex(
      (rubric) => rubric.name === currentRubric.name
    );

    if (existingIndex >= 0) {
      updatedRubrics[existingIndex] = rubricCopy;
    } else {
      updatedRubrics.push(rubricCopy);
    }

    set({ availableRubrics: updatedRubrics });
    loadRubricsForCourse(currentCourse);
  },

  // Load rubric state for a specific submission
  loadRubricForSubmission: (assignmentId, submissionId, baseRubric) => {
    if (!baseRubric) return;
    
    const savedState = getRubricState(assignmentId, submissionId);
    
    if (savedState && savedState.criteria) {
      // Load saved rubric state (criteria selections, comments, feedbackLabel)
      // Merge saved selections/comments with base rubric levels
      const rubricCopy = JSON.parse(JSON.stringify(baseRubric));
      rubricCopy.criteria = rubricCopy.criteria.map((baseCriterion, index) => {
        const savedCriterion = savedState.criteria[index];
        if (savedCriterion && savedCriterion.name === baseCriterion.name) {
          // Use saved selections/comments but keep base levels
          return {
            ...baseCriterion,
            selectedLevel: savedCriterion.selectedLevel,
            comment: savedCriterion.comment || '',
          };
        }
        return {
          ...baseCriterion,
          selectedLevel: null,
          comment: '',
        };
      });
      rubricCopy.feedbackLabel = savedState.feedbackLabel || '';
      set({ currentRubric: rubricCopy, currentCriterionIndex: 0 });
    } else {
      // Reset rubric for ungraded submission
      const rubricCopy = JSON.parse(JSON.stringify(baseRubric));
      rubricCopy.criteria = rubricCopy.criteria.map(criterion => ({
        ...criterion,
        selectedLevel: null,
        comment: '',
      }));
      rubricCopy.feedbackLabel = '';
      const { correctByDefault } = get();
      if (correctByDefault) {
        const resetRubric = selectMaxLevels(rubricCopy);
        set({ currentRubric: resetRubric, currentCriterionIndex: 0 });
      } else {
        set({ currentRubric: rubricCopy, currentCriterionIndex: 0 });
      }
    }
    get().saveSession();
  },

  // Save rubric state for current submission
  saveRubricForSubmission: (assignmentId, submissionId) => {
    const { currentRubric } = get();
    if (!currentRubric || !assignmentId || !submissionId) return;
    
    const rubricState = {
      criteria: currentRubric.criteria.map(criterion => ({
        name: criterion.name,
        description: criterion.description,
        enableRange: criterion.enableRange,
        selectedLevel: criterion.selectedLevel,
        comment: criterion.comment,
        levels: criterion.levels, // Keep levels for reference
      })),
      feedbackLabel: currentRubric.feedbackLabel || '',
    };
    
    saveRubricState(assignmentId, submissionId, rubricState);
  },
}));

// Initialize debounced saveSession after store creation
useRubricStore.getState().saveSessionDebounced = debounceSaveSession(
  () => useRubricStore.getState().saveSession()
);

export default useRubricStore;

