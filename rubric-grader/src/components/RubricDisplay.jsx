import { useState, useEffect, useRef } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  TextField,
  Stack,
  Chip,
  Divider,
  Tooltip,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import {
  NavigateBefore,
  NavigateNext,
  Comment as CommentIcon,
  Add as AddIcon,
  Edit as EditIcon,
} from '@mui/icons-material';
import { useHotkeys } from 'react-hotkeys-hook';
import useRubricStore from '../store/rubricStore';
import { renderTextWithLatex } from '../utils/latex.jsx';

const RubricDisplay = () => {
  const {
    currentRubric,
    currentCriterionIndex,
    selectLevel,
    updateComment,
    goToNextCriterion,
    goToPreviousCriterion,
    goToCriterion,
    addLevel,
    updateLevel,
    deleteLevel,
  } = useRubricStore();

  const [commentFocused, setCommentFocused] = useState(false);
  const commentRef = useRef(null);
  const [levelDialogOpen, setLevelDialogOpen] = useState(false);
  const [levelDialogMode, setLevelDialogMode] = useState('add');
  const [levelForm, setLevelForm] = useState({
    name: '',
    points: '',
    description: '',
  });
  const [levelFormError, setLevelFormError] = useState('');
  const [editingLevelIndex, setEditingLevelIndex] = useState(null);

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

  const handleOpenAddLevelDialog = () => {
    setLevelDialogMode('add');
    setLevelForm({
      name: '',
      points: '',
      description: '',
    });
    setLevelFormError('');
    setEditingLevelIndex(null);
    setLevelDialogOpen(true);
  };

  const handleOpenEditLevelDialog = (index) => {
    if (!criterion?.levels?.[index]) return;
    const level = criterion.levels[index];
    setLevelDialogMode('edit');
    setLevelForm({
      name: level.name || '',
      points: level.points !== undefined && level.points !== null ? String(level.points) : '',
      description: level.description || '',
    });
    setLevelFormError('');
    setEditingLevelIndex(index);
    setLevelDialogOpen(true);
  };

  const handleLevelFormChange = (field) => (event) => {
    setLevelForm((prev) => ({
      ...prev,
      [field]: event.target.value,
    }));
  };

  const handleCloseLevelDialog = () => {
    setLevelDialogOpen(false);
    setLevelFormError('');
    setEditingLevelIndex(null);
  };

  const handleSubmitLevelDialog = () => {
    if (!currentRubric) return;

    const parsedPoints = Number(levelForm.points);
    if (Number.isNaN(parsedPoints)) {
      setLevelFormError('Please enter a numeric point value.');
      return;
    }

    const payload = {
      name: levelForm.name,
      description: levelForm.description,
      points: parsedPoints,
    };

    if (levelDialogMode === 'add') {
      addLevel(currentCriterionIndex, payload);
    } else if (levelDialogMode === 'edit' && editingLevelIndex !== null) {
      updateLevel(currentCriterionIndex, editingLevelIndex, payload);
    }

    handleCloseLevelDialog();
  };

  const handleDeleteLevel = () => {
    if (!currentRubric || editingLevelIndex === null) return;
    deleteLevel(currentCriterionIndex, editingLevelIndex);
    handleCloseLevelDialog();
  };

  // All hooks must be called unconditionally - disable when no rubric
  const hasRubric = !!currentRubric;
  const canUseHotkeys = hasRubric && !commentFocused && !levelDialogOpen;

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
      if (hasRubric && !commentFocused && !levelDialogOpen) {
        keyboardEvent.preventDefault();
        commentRef.current?.focus();
      }
    },
    { enabled: hasRubric && !commentFocused && !levelDialogOpen, preventDefault: true },
    [commentFocused, hasRubric, levelDialogOpen]
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
        <Stack spacing={1} sx={{ mb: 2 }}>
          {criterion.levels.map((level, index) => {
            const isSelected = criterion.selectedLevel === index;
            return (
              <Stack
                key={`${level.name || 'level'}-${index}`}
                direction="row"
                spacing={1}
                alignItems="center"
              >
                <Box sx={{ flex: 1 }}>
                  <Tooltip
                    title={
                      level.description ? (
                        <Box sx={{ maxWidth: 320 }}>
                          {renderTextWithLatex(level.description, {
                            inline: false,
                          })}
                        </Box>
                      ) : ''
                    }
                    placement="right"
                    arrow
                  >
                    <Button
                      fullWidth
                      variant={isSelected ? 'contained' : 'outlined'}
                      onClick={() => handleLevelSelect(index)}
                      sx={{
                        textTransform: 'none',
                        justifyContent: 'space-between',
                        textAlign: 'left',
                        minHeight: 'auto',
                        py: 1.5,
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
                          {renderTextWithLatex(
                            level.name || `Level ${index + 1}`,
                            { inline: true }
                          )}
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
                </Box>
                <Tooltip title="Edit level" arrow>
                  <IconButton
                    size="small"
                    color="primary"
                    onClick={() => handleOpenEditLevelDialog(index)}
                    aria-label={`Edit level ${level.name || index + 1}`}
                  >
                    <EditIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Stack>
            );
          })}
        </Stack>
        <Button
          variant="outlined"
          startIcon={<AddIcon />}
          onClick={handleOpenAddLevelDialog}
          sx={{ alignSelf: 'flex-start', mb: 2 }}
        >
          Add Item
        </Button>

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
      <Dialog
        open={levelDialogOpen}
        onClose={handleCloseLevelDialog}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>
          {levelDialogMode === 'add' ? 'Add Rubric Level' : 'Edit Rubric Level'}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Level Name"
              value={levelForm.name}
              onChange={handleLevelFormChange('name')}
              placeholder="e.g., Exceeds expectations"
              autoFocus
            />
            <TextField
              label="Points"
              type="number"
              value={levelForm.points}
              onChange={handleLevelFormChange('points')}
              error={Boolean(levelFormError)}
              helperText={levelFormError || 'Enter a whole number or decimal value'}
            />
            <TextField
              label="Description"
              value={levelForm.description}
              onChange={handleLevelFormChange('description')}
              multiline
              minRows={3}
              placeholder="Optional description for this level"
            />
            <Box sx={{ mt: 2 }}>
              <Typography variant="subtitle2">Preview</Typography>
              <Paper
                variant="outlined"
                sx={{
                  mt: 1,
                  p: 2,
                  backgroundColor: 'grey.50',
                }}
              >
                <Typography
                  component="div"
                  variant="body1"
                  fontWeight="bold"
                  sx={{ mb: levelForm.description ? 1 : 0 }}
                >
                  {renderTextWithLatex(
                    levelForm.name || 'Level name preview',
                    { inline: true }
                  )}
                </Typography>
                <Box component="div">
                  {levelForm.description ? (
                    renderTextWithLatex(levelForm.description, { inline: false })
                  ) : (
                    <Typography variant="body2" color="text.secondary">
                      Description preview will appear here.
                    </Typography>
                  )}
                </Box>
              </Paper>
            </Box>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ justifyContent: 'space-between' }}>
          {levelDialogMode === 'edit' ? (
            <Button color="error" onClick={handleDeleteLevel}>
              Delete Level
            </Button>
          ) : (
            <Box />
          )}
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button onClick={handleCloseLevelDialog}>Cancel</Button>
            <Button variant="contained" onClick={handleSubmitLevelDialog}>
              {levelDialogMode === 'add' ? 'Add Level' : 'Save Changes'}
            </Button>
          </Box>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default RubricDisplay;

