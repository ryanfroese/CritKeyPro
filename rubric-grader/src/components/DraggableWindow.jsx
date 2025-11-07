import { useState, useRef, useEffect } from 'react';
import { Paper, Box, IconButton, Stack, Typography } from '@mui/material';
import { DragIndicator, Minimize, Close } from '@mui/icons-material';

const DraggableWindow = ({ title, children, onClose }) => {
  const [position, setPosition] = useState({ x: 50, y: 50 });
  const [isDragging, setIsDragging] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const windowRef = useRef(null);

  const handleMouseDown = (e) => {
    if (e.target.closest('.no-drag')) return;
    
    const rect = windowRef.current.getBoundingClientRect();
    setDragOffset({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
    setIsDragging(true);
  };

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isDragging) return;

      const newX = e.clientX - dragOffset.x;
      const newY = e.clientY - dragOffset.y;

      // Keep window within viewport
      const maxX = window.innerWidth - 300;
      const maxY = window.innerHeight - 100;

      setPosition({
        x: Math.max(0, Math.min(newX, maxX)),
        y: Math.max(0, Math.min(newY, maxY)),
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragOffset]);

  return (
    <Paper
      ref={windowRef}
      elevation={8}
      sx={{
        position: 'fixed',
        left: position.x,
        top: position.y,
        width: isMinimized ? 300 : 600,
        maxWidth: '90vw',
        maxHeight: isMinimized ? 'auto' : '90vh',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 1300,
        cursor: isDragging ? 'grabbing' : 'default',
        transition: isMinimized ? 'width 0.2s ease' : 'none',
      }}
    >
      {/* Title Bar */}
      <Box
        onMouseDown={handleMouseDown}
        sx={{
          backgroundColor: 'primary.main',
          color: 'primary.contrastText',
          p: 1,
          cursor: 'grab',
          '&:active': { cursor: 'grabbing' },
        }}
      >
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          <Stack direction="row" alignItems="center" spacing={1}>
            <DragIndicator />
            <Typography variant="subtitle1" fontWeight="bold">
              {title}
            </Typography>
          </Stack>
          <Stack direction="row" spacing={0.5} className="no-drag">
            <IconButton
              size="small"
              onClick={() => setIsMinimized(!isMinimized)}
              sx={{ color: 'inherit' }}
            >
              <Minimize />
            </IconButton>
            {onClose && (
              <IconButton
                size="small"
                onClick={onClose}
                sx={{ color: 'inherit' }}
              >
                <Close />
              </IconButton>
            )}
          </Stack>
        </Stack>
      </Box>

      {/* Content */}
      {!isMinimized && (
        <Box
          className="no-drag"
          sx={{
            p: 2,
            overflow: 'auto',
            flex: 1,
          }}
        >
          {children}
        </Box>
      )}
    </Paper>
  );
};

export default DraggableWindow;

