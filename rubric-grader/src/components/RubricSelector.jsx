import {
  Box,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Button,
  Stack,
  IconButton,
  Tooltip,
} from '@mui/material';
import { Delete as DeleteIcon, Refresh as RefreshIcon } from '@mui/icons-material';
import useRubricStore from '../store/rubricStore';

const RubricSelector = () => {
  const {
    currentCourse,
    currentRubric,
    availableRubrics,
    selectRubric,
    deleteRubric,
    resetGrading,
  } = useRubricStore();

  if (!currentCourse) {
    return null;
  }

  const handleDelete = () => {
    if (currentRubric && window.confirm(`Delete rubric "${currentRubric.name}"?`)) {
      deleteRubric(currentRubric.name);
    }
  };

  const handleReset = () => {
    if (window.confirm('Reset all selections and comments for this rubric?')) {
      resetGrading();
    }
  };

  return (
    <Box sx={{ mb: 3 }}>
      <Stack direction="row" spacing={1} alignItems="center">
        <FormControl fullWidth size="small">
          <InputLabel>Rubric</InputLabel>
          <Select
            value={currentRubric?.name || ''}
            label="Rubric"
            onChange={(e) => selectRubric(e.target.value)}
          >
            {availableRubrics.length === 0 && (
              <MenuItem disabled value="" sx={{ whiteSpace: 'normal', wordBreak: 'break-word' }}>
                No rubrics available - Import one above
              </MenuItem>
            )}
            {availableRubrics.map((rubric) => (
              <MenuItem key={rubric.name} value={rubric.name}>
                {rubric.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        {currentRubric && (
          <>
            <Tooltip title="Reset grading">
              <IconButton onClick={handleReset} color="primary">
                <RefreshIcon />
              </IconButton>
            </Tooltip>
            <Tooltip title="Delete rubric">
              <IconButton onClick={handleDelete} color="error">
                <DeleteIcon />
              </IconButton>
            </Tooltip>
          </>
        )}
      </Stack>
    </Box>
  );
};

export default RubricSelector;

