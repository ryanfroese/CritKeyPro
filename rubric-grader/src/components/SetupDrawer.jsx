import { useMemo, useState } from 'react';
import {
  Box,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Typography,
  Divider,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormGroup,
  FormControlLabel,
  Checkbox,
  Alert,
  Switch,
} from '@mui/material';
import { Settings as SettingsIcon, ExpandMore as ExpandMoreIcon, Add as AddIcon } from '@mui/icons-material';
import useRubricStore from '../store/rubricStore';
import CourseSelector from './CourseSelector';
import RubricSelector from './RubricSelector';
import CSVImport from './CSVImport';
import { generateCanvasCSV } from '../utils/csvParser';
import JSZip from 'jszip';
import TextField from '@mui/material/TextField';

const SetupDrawer = () => {
  const [expanded, setExpanded] = useState(true);
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [selectedRubricNames, setSelectedRubricNames] = useState([]);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newRubricName, setNewRubricName] = useState('');
  const [createError, setCreateError] = useState('');

  const { availableRubrics, currentCourse, autoAdvance, setAutoAdvance, correctByDefault, setCorrectByDefault, createRubric } = useRubricStore();

  const sortedRubrics = useMemo(() => {
    return [...availableRubrics].sort((a, b) => a.name.localeCompare(b.name));
  }, [availableRubrics]);

  const handleToggleRubric = (rubricName) => () => {
    setSelectedRubricNames((prev) =>
      prev.includes(rubricName)
        ? prev.filter((name) => name !== rubricName)
        : [...prev, rubricName]
    );
  };

  const handleCloseDownload = () => {
    setDownloadOpen(false);
  };

  const handleOpenDownload = () => {
    setSelectedRubricNames(sortedRubrics.map((rubric) => rubric.name));
    setDownloadOpen(true);
  };

  const handleDownload = async () => {
    if (selectedRubricNames.length === 0) return;

    const rubricsToExport = sortedRubrics.filter((rubric) =>
      selectedRubricNames.includes(rubric.name)
    );

    if (rubricsToExport.length === 0) return;

    const formatLocalDate = () => {
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    const timestamp = formatLocalDate();

    const downloadBlob = (blob, filename) => {
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    };

    if (rubricsToExport.length === 1) {
      const rubric = rubricsToExport[0];
      const csv = generateCanvasCSV([rubric]);
      const filename = `${(rubric.name || 'rubric').replace(/\s+/g, '_')}_${timestamp}.csv`;
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      downloadBlob(blob, filename);
    } else {
      const zip = new JSZip();
      rubricsToExport.forEach((rubric) => {
        const csv = generateCanvasCSV([rubric]);
        const itemName = (rubric.name || 'rubric').replace(/\s+/g, '_');
        zip.file(`${itemName}_${timestamp}.csv`, csv);
      });

      const zipContent = await zip.generateAsync({ type: 'blob' });
      const zipName = `rubrics_${rubricsToExport.length}_items_${timestamp}.zip`;
      downloadBlob(zipContent, zipName);
    }

    setDownloadOpen(false);
  };

  const handleOpenCreateDialog = () => {
    setNewRubricName('');
    setCreateError('');
    setCreateDialogOpen(true);
  };

  const handleCloseCreateDialog = () => {
    setCreateDialogOpen(false);
    setNewRubricName('');
    setCreateError('');
  };

  const handleCreateRubric = () => {
    if (!newRubricName.trim()) {
      setCreateError('Please enter a rubric name');
      return;
    }

    // Check if name already exists
    if (availableRubrics.some(r => r.name === newRubricName.trim())) {
      setCreateError('A rubric with this name already exists');
      return;
    }

    try {
      createRubric(newRubricName.trim());
      handleCloseCreateDialog();
    } catch (error) {
      setCreateError(error.message || 'Failed to create rubric');
    }
  };

  const handleCreateKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleCreateRubric();
    }
  };

  return (
    <Box sx={{ mb: 3 }}>
      <Accordion 
        expanded={expanded} 
        onChange={(e, isExpanded) => setExpanded(isExpanded)}
        sx={{ 
          '&:before': {
            display: 'none',
          },
        }}
      >
        <AccordionSummary
          expandIcon={<ExpandMoreIcon />}
          sx={{
            '& .MuiAccordionSummary-content': {
              alignItems: 'center',
            },
          }}
        >
          <SettingsIcon sx={{ mr: 1, color: 'text.secondary' }} />
          <Typography variant="subtitle1">
            Setup
          </Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Box sx={{ py: 1 }}>
            <CourseSelector />
            <RubricSelector />
            <Button
              fullWidth
              variant="contained"
              startIcon={<AddIcon />}
              onClick={handleOpenCreateDialog}
              disabled={!currentCourse}
              sx={{ mb: 2 }}
            >
              Create New Rubric
            </Button>
            <FormGroup sx={{ my: 1 }}>
              <FormControlLabel
                control={
                  <Switch
                    checked={autoAdvance}
                    onChange={(event) => setAutoAdvance(event.target.checked)}
                    size="small"
                  />
                }
                label="Auto advance after selection"
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={correctByDefault}
                    onChange={(event) => setCorrectByDefault(event.target.checked)}
                    size="small"
                  />
                }
                label="Correct by default"
              />
            </FormGroup>
            <Button
              fullWidth
              variant="outlined"
              sx={{ mt: 1 }}
              onClick={handleOpenDownload}
              disabled={sortedRubrics.length === 0}
            >
              Download Rubrics
            </Button>
            <Divider sx={{ my: 2 }} />
            <CSVImport />
          </Box>
        </AccordionDetails>
      </Accordion>

      <Dialog
        open={downloadOpen}
        onClose={handleCloseDownload}
        PaperProps={{
          sx: { zIndex: 1400 }
        }}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Select rubrics to download</DialogTitle>
        <DialogContent dividers>
          {sortedRubrics.length === 0 ? (
            <Alert severity="info">
              No rubrics available to download. Import or create a rubric first.
            </Alert>
          ) : (
            <FormGroup>
              {sortedRubrics.map((rubric) => (
                <FormControlLabel
                  key={rubric.name}
                  control={
                    <Checkbox
                      checked={selectedRubricNames.includes(rubric.name)}
                      onChange={handleToggleRubric(rubric.name)}
                    />
                  }
                  label={rubric.name}
                />
              ))}
            </FormGroup>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDownload}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleDownload}
            disabled={selectedRubricNames.length === 0}
          >
            Download Selected
          </Button>
        </DialogActions>
      </Dialog>

      {/* Create Rubric Dialog */}
      <Dialog
        open={createDialogOpen}
        onClose={handleCloseCreateDialog}
        PaperProps={{
          sx: { zIndex: 1400 }
        }}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Create New Rubric</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Rubric Name"
            fullWidth
            variant="outlined"
            value={newRubricName}
            onChange={(e) => {
              setNewRubricName(e.target.value);
              setCreateError('');
            }}
            onKeyPress={handleCreateKeyPress}
            error={!!createError}
            helperText={createError || 'Enter a name for your new rubric'}
            sx={{ mt: 2 }}
          />
          <Alert severity="info" sx={{ mt: 2 }}>
            A new rubric will be created with a single criterion and one level. You can edit it in the grading view.
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseCreateDialog}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleCreateRubric}
            disabled={!newRubricName.trim()}
          >
            Create
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default SetupDrawer;

