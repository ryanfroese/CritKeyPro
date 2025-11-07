import { useState, useEffect, useRef } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  ButtonGroup,
  TextField,
  Stack,
  Chip,
  Divider,
  Tooltip,
} from '@mui/material';
import {
  NavigateBefore,
  NavigateNext,
  Comment as CommentIcon,
} from '@mui/icons-material';
import { useHotkeys } from 'react-hotkeys-hook';
import useRubricStore from '../store/rubricStore';

const RubricDisplay = () => {
  const {
    currentRubric,
    currentCriterionIndex,
    selectLevel,
    updateComment,
    goToNextCriterion,
    goToPreviousCriterion,
    goToCriterion,
  } = useRubricStore();

  const [commentFocused, setCommentFocused] = useState(false);
  const commentRef = useRef(null);

  // Get criterion safely - will be null if no rubric
  const criterion = currentRubric?.criteria?.[currentCriterionIndex] || null;
  const totalCriteria = currentRubric?.criteria?.length || 0;

  const handleLevelSelect = (levelIndex) => {
    if (!currentRubric) return;
    selectLevel(currentCriterionIndex, levelIndex);
    // Auto-advance to next criterion after selection
    setTimeout(() => {
      if (currentCriterionIndex < totalCriteria - 1) {
        goToNextCriterion();
      }
    }, 150);
  };

  const handleCommentChange = (e) => {
    if (!currentRubric) return;
    updateComment(currentCriterionIndex, e.target.value);
  };

  // All hooks must be called unconditionally - disable when no rubric
  const hasRubric = !!currentRubric;
  const canUseHotkeys = hasRubric && !commentFocused;

  // Keyboard shortcuts (1-9 for levels) - combined into single hook
  useHotkeys(
    '1,2,3,4,5,6,7,8,9',
    (keyboardEvent, hotkeysEvent) => {
      if (canUseHotkeys && criterion) {
        const levelIndex = parseInt(hotkeysEvent.keys[0]) - 1;
        if (criterion.levels?.[levelIndex]) {
          handleLevelSelect(levelIndex);
        }
      }
    },
    { enabled: canUseHotkeys },
    [currentCriterionIndex, commentFocused, criterion, canUseHotkeys]
  );

  // Navigation hotkeys
  useHotkeys(
    'n, right',
    () => {
      if (canUseHotkeys) goToNextCriterion();
    },
    { enabled: canUseHotkeys },
    [commentFocused, canUseHotkeys]
  );

  useHotkeys(
    'p, left',
    () => {
      if (canUseHotkeys) goToPreviousCriterion();
    },
    { enabled: canUseHotkeys },
    [commentFocused, canUseHotkeys]
  );

  // Focus comment hotkey
  useHotkeys(
    'c',
    (keyboardEvent) => {
      if (hasRubric && !commentFocused) {
        keyboardEvent.preventDefault();
        commentRef.current?.focus();
      }
    },
    { enabled: hasRubric && !commentFocused, preventDefault: true },
    [commentFocused, hasRubric]
  );

  // Escape to unfocus comment
  useHotkeys(
    'escape',
    () => {
      if (commentFocused) {
        commentRef.current?.blur();
      }
    },
    { enabled: commentFocused },
    [commentFocused]
  );

  // Early return AFTER all hooks
  if (!currentRubric) {
    return (
      <Paper sx={{ p: 3, textAlign: 'center' }}>
        <Typography color="text.secondary">
          Select a rubric to begin grading
        </Typography>
      </Paper>
    );
  }

  return (
    <Box>
      {/* Criterion Navigation */}
      <Paper sx={{ p: 2, mb: 2 }}>
        <Stack 
          direction={{ xs: 'column', sm: 'row' }} 
          justifyContent="space-between" 
          alignItems={{ xs: 'flex-start', sm: 'center' }}
          spacing={{ xs: 1, sm: 0 }}
        >
          <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
            Criterion {currentCriterionIndex + 1} of {totalCriteria}
          </Typography>
          <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
            <Button
              size="small"
              startIcon={<NavigateBefore />}
              onClick={goToPreviousCriterion}
              disabled={currentCriterionIndex === 0}
              sx={{ whiteSpace: 'nowrap', minWidth: 'fit-content' }}
            >
              Previous (P/←)
            </Button>
            <Button
              size="small"
              endIcon={<NavigateNext />}
              onClick={goToNextCriterion}
              disabled={currentCriterionIndex === totalCriteria - 1}
              sx={{ whiteSpace: 'nowrap', minWidth: 'fit-content' }}
            >
              Next (N/→)
            </Button>
          </Stack>
        </Stack>
      </Paper>

      {/* Current Criterion */}
      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" gutterBottom>
          {criterion.name}
        </Typography>
        {criterion.description && (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            {criterion.description}
          </Typography>
        )}

        <Divider sx={{ my: 2 }} />

        {/* Level Selection */}
        <Typography variant="subtitle2" gutterBottom>
          Select Level (Hotkeys 1-{criterion.levels.length}):
        </Typography>
        <ButtonGroup
          orientation="vertical"
          fullWidth
          sx={{ mb: 2 }}
        >
          {criterion.levels.map((level, index) => {
            const isSelected = criterion.selectedLevel === index;
            return (
              <Tooltip
                key={index}
                title={level.description || ''}
                placement="right"
                arrow
              >
                <Button
                  variant={isSelected ? 'contained' : 'outlined'}
                  onClick={() => handleLevelSelect(index)}
                  sx={{
                    justifyContent: 'space-between',
                    py: 1.5,
                    textAlign: 'left',
                    minHeight: 'auto',
                    overflow: 'hidden',
                  }}
                >
                  <Stack 
                    direction="row" 
                    spacing={1} 
                    alignItems="center"
                    sx={{ 
                      flex: 1,
                      minWidth: 0,
                      overflow: 'hidden',
                    }}
                  >
                    <Chip
                      label={index + 1}
                      size="small"
                      color={isSelected ? 'primary' : 'default'}
                      sx={{ flexShrink: 0 }}
                    />
                    <Typography 
                      variant="body2"
                      sx={{
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        flex: 1,
                      }}
                    >
                      {level.name || `Level ${index + 1}`}
                    </Typography>
                  </Stack>
                  <Typography
                    variant="body1"
                    fontWeight="bold"
                    color={isSelected ? 'inherit' : 'primary'}
                    sx={{ 
                      ml: 1,
                      flexShrink: 0,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {level.points} pts
                  </Typography>
                </Button>
              </Tooltip>
            );
          })}
        </ButtonGroup>

        {/* Comment Field */}
        <Stack direction="row" spacing={1} alignItems="flex-start">
          <CommentIcon sx={{ mt: 1, color: 'text.secondary' }} />
          <TextField
            fullWidth
            multiline
            rows={2}
            label="Additional Comment (Press C to focus)"
            value={criterion.comment}
            onChange={handleCommentChange}
            onFocus={() => setCommentFocused(true)}
            onBlur={() => setCommentFocused(false)}
            inputRef={commentRef}
            placeholder="Optional feedback for this criterion..."
          />
        </Stack>
      </Paper>

      {/* Criterion Overview */}
      <Paper sx={{ p: 2, mt: 2 }}>
        <Typography variant="subtitle2" gutterBottom>
          All Criteria:
        </Typography>
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          {currentRubric.criteria.map((crit, index) => {
            const isComplete = crit.selectedLevel !== null && crit.selectedLevel !== undefined;
            const isCurrent = index === currentCriterionIndex;
            return (
              <Chip
                key={index}
                label={`${index + 1}. ${crit.name}`}
                onClick={() => goToCriterion(index)}
                color={isCurrent ? 'primary' : isComplete ? 'success' : 'default'}
                variant={isCurrent ? 'filled' : isComplete ? 'outlined' : 'outlined'}
                size="small"
                sx={{ 
                  mb: 1,
                  maxWidth: '100%',
                  '& .MuiChip-label': {
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    display: 'block',
                  },
                }}
              />
            );
          })}
        </Stack>
      </Paper>
    </Box>
  );
};

export default RubricDisplay;

