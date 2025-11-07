import { useState } from 'react';
import {
  Box,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  Button,
  Stack,
} from '@mui/material';
import { Add as AddIcon } from '@mui/icons-material';
import useRubricStore from '../store/rubricStore';

const CourseSelector = () => {
  const [isAddingCourse, setIsAddingCourse] = useState(false);
  const [newCourseId, setNewCourseId] = useState('');
  
  const { 
    currentCourse, 
    availableCourses, 
    selectCourse, 
    addCourse 
  } = useRubricStore();

  const handleAddCourse = () => {
    if (newCourseId.trim()) {
      addCourse(newCourseId.trim());
      selectCourse(newCourseId.trim());
      setNewCourseId('');
      setIsAddingCourse(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleAddCourse();
    }
  };

  if (isAddingCourse) {
    return (
      <Box sx={{ mb: 3 }}>
        <Stack direction="row" spacing={1}>
          <TextField
            fullWidth
            size="small"
            label="New Course ID"
            value={newCourseId}
            onChange={(e) => setNewCourseId(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="e.g., CS101"
            autoFocus
          />
          <Button onClick={handleAddCourse} variant="contained">
            Add
          </Button>
          <Button onClick={() => setIsAddingCourse(false)} variant="outlined">
            Cancel
          </Button>
        </Stack>
      </Box>
    );
  }

  return (
    <Box sx={{ mb: 3 }}>
      <Stack direction="row" spacing={1}>
        <FormControl fullWidth size="small">
          <InputLabel>Course</InputLabel>
          <Select
            value={availableCourses.includes(currentCourse) ? currentCourse : ''}
            label="Course"
            onChange={(e) => selectCourse(e.target.value)}
          >
            {availableCourses.length === 0 && (
              <MenuItem disabled value="">
                No courses yet
              </MenuItem>
            )}
            {availableCourses.map((course) => (
              <MenuItem key={course} value={course}>
                {course}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <Button
          variant="outlined"
          startIcon={<AddIcon />}
          onClick={() => setIsAddingCourse(true)}
          sx={{ 
            whiteSpace: 'nowrap',
            minWidth: 'fit-content',
            px: 2,
            flexShrink: 0,
          }}
        >
          New Course
        </Button>
      </Stack>
    </Box>
  );
};

export default CourseSelector;

