import { useEffect } from 'react';
import { 
  CssBaseline, 
  ThemeProvider, 
  createTheme,
  Container,
  Box,
  Typography,
  Paper,
  Divider,
  Stack,
} from '@mui/material';
import useRubricStore from './store/rubricStore';
import SetupDrawer from './components/SetupDrawer';
import RubricDisplay from './components/RubricDisplay';
import TotalPoints from './components/TotalPoints';
import FeedbackGenerator from './components/FeedbackGenerator';

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#1976d2',
    },
    secondary: {
      main: '#dc004e',
    },
  },
});

function App() {
  const initialize = useRubricStore((state) => state.initialize);

  useEffect(() => {
    initialize();
  }, [initialize]);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box 
        sx={{ 
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: 'background.default',
        }}
      >
        <Container maxWidth="xl" sx={{ py: 3, flex: 1, display: 'flex', flexDirection: 'column' }}>
          {/* Header */}
          <Paper elevation={0} sx={{ mb: 3, p: 2, backgroundColor: 'grey.50' }}>
            <Typography variant="h5" gutterBottom fontWeight="bold">
              CritKey Grader
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Fast rubric grading with keyboard shortcuts
            </Typography>
          </Paper>

          {/* Main Content */}
          <Stack 
            direction={{ xs: 'column', md: 'row' }} 
            spacing={2} 
            sx={{ flex: 1, minHeight: 0 }}
          >
            {/* Left Panel - Setup */}
            <Box sx={{ width: { xs: '100%', md: '33.333%' } }}>
              <SetupDrawer />
              <TotalPoints />
            </Box>

            {/* Right Panel - Grading */}
            <Box sx={{ width: { xs: '100%', md: '66.666%' }, flex: 1, minHeight: 0 }}>
              <RubricDisplay />
              <FeedbackGenerator />
            </Box>
          </Stack>

          {/* Keyboard Shortcuts Help */}
          <Paper 
            elevation={0} 
            sx={{ 
              mt: 3, 
              p: 2, 
              backgroundColor: 'grey.50',
              borderTop: 1,
              borderColor: 'divider',
            }}
          >
            <Typography variant="caption" color="text.secondary" component="div">
              <strong>Keyboard Shortcuts:</strong> 1-9: Select level | N/→: Next | P/←: Previous | C: Comment | Ctrl+Enter: Generate feedback
            </Typography>
          </Paper>
        </Container>
      </Box>
    </ThemeProvider>
  );
}

export default App;
