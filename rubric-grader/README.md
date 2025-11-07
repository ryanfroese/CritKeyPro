# HotRubric Grader

A fast, keyboard-driven rubric grading tool for educators. Import Canvas rubrics as CSV files and grade with hotkeys for maximum efficiency.

## Features

✨ **Fast Grading**
- Keyboard shortcuts (1-9) to select rubric levels
- Navigate between criteria with arrow keys or N/P
- Auto-advance to next criterion after selection

📋 **Rubric Management**
- Import Canvas-exported rubric CSVs
- Organize rubrics by course
- Save rubrics to browser localStorage
- Reuse rubrics across multiple grading sessions

🎯 **Compact & Portable**
- Draggable floating window
- Position it anywhere on screen
- Grade side-by-side with student work

📝 **Feedback Generation**
- Automatic feedback text generation
- One-click copy to clipboard
- Paste directly into Canvas

💾 **Auto-Save**
- Progress automatically saved
- Resume grading after browser refresh
- Never lose your work

## Getting Started

### Installation

```bash
cd rubric-grader
npm install
npm run dev
```

### Import a Rubric

1. **Select or create a course** using the course dropdown
2. **Export your rubric from Canvas**:
   - Go to your course in Canvas
   - Navigate to Rubrics
   - Click on your rubric
   - Click "Export" and download as CSV
3. **Drag and drop** the CSV file into the import area

### Grade with Hotkeys

- **1-9**: Select rubric level (1 = highest points)
- **N** or **→**: Next criterion
- **P** or **←**: Previous criterion
- **C**: Focus comment field
- **Esc**: Unfocus comment field
- **Ctrl/Cmd + Enter**: Generate feedback

### Generate Feedback

1. Complete grading all criteria
2. Click "Generate Feedback" or press **Ctrl/Cmd + Enter**
3. Review the feedback text (edit if needed)
4. Click "Copy to Clipboard"
5. Paste into Canvas assignment feedback

## Project Structure

```
src/
├── components/
│   ├── CourseSelector.jsx      # Course selection UI
│   ├── CSVImport.jsx           # CSV import with drag-and-drop
│   ├── DraggableWindow.jsx     # Draggable container
│   ├── FeedbackGenerator.jsx   # Feedback text generation
│   ├── RubricDisplay.jsx       # Main grading interface
│   ├── RubricSelector.jsx      # Rubric selection UI
│   └── TotalPoints.jsx         # Running score display
├── store/
│   └── rubricStore.js          # Zustand state management
├── utils/
│   ├── csvParser.js            # Canvas CSV parsing
│   └── localStorage.js         # Browser storage utilities
├── App.jsx                     # Main app component
└── main.jsx                    # Entry point
```

## Technologies

- **React** - UI framework
- **Vite** - Build tool
- **Zustand** - State management
- **Material-UI** - Component library
- **PapaParse** - CSV parsing
- **react-hotkeys-hook** - Keyboard shortcuts

## Canvas CSV Format

The app expects Canvas rubric exports in the following format:

```csv
Rubric Name,Criteria Name,Criteria Description,Criteria Enable Range,Rating Name,Rating Description,Rating Points,...
```

Each row represents one criterion, with rating levels in groups of 3 columns (Name, Description, Points).

## Local Storage

All data is stored locally in your browser:
- Rubrics are organized by course ID
- Current grading session is auto-saved
- No data is sent to any server

## Development

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## License

MIT

## Contributing

Contributions welcome! Please open an issue or PR.
