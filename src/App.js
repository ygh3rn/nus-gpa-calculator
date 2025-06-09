import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Plus, X, Info, AlertTriangle, Eye, EyeOff } from 'lucide-react';

// Constants
const GRADE_POINTS = {
  'A+': 5.0, 'A': 5.0, 'A-': 4.5,
  'B+': 4.0, 'B': 3.5, 'B-': 3.0,
  'C+': 2.5, 'C': 2.0, 'C-': 1.5,
  'D+': 1.0, 'D': 0.5, 'F': 0.0,
  'N/A': null, 'S': null, 'U': null, 'CS': null, 'CU': null
};

const STORAGE_KEYS = {
  SELECTED_MODULES: 'nus-gpa-selectedModules',
  ACTIVE_SEMESTERS: 'nus-gpa-activeSemesters',
  ACADEMIC_SETTINGS: 'nus-gpa-academicSettings',
  SELECTED_YEAR: 'nus-gpa-selectedYear',
  VISIBLE_YEARS: 'nus-gpa-visibleYears',
  SHOW_HINT: 'nus-gpa-showHint',
  HIDE_GRADES: 'nus-gpa-hideGrades'
};

const MATRIC_YEAR_OPTIONS = [
  'AY25/26', 'AY24/25', 'AY23/24', 'AY22/23', 'AY21/22', 'AY20/21', 'AY19/20'
];

const GRADE_GRID = [
  ['A+', 'A', 'A-'],
  ['B+', 'B', 'B-'],
  ['C+', 'C', 'C-'],
  ['D+', 'D', 'F'],
  ['CS', 'CU', '']
];

// Utility functions
const saveToStorage = (key, data) => {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (error) {
    console.error('Failed to save to localStorage:', error);
  }
};

const loadFromStorage = (key, defaultValue = null) => {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : defaultValue;
  } catch (error) {
    console.error('Failed to load from localStorage:', error);
    return defaultValue;
  }
};

const generateAllSemesters = (matricYear) => {
  const semesters = [];
  const startYear = parseInt(matricYear.substring(2, 4));
  const maxYears = 6;
  
  for (let year = 0; year < maxYears; year++) {
    const currentYear = startYear + year;
    const nextYear = currentYear + 1;
    const ayString = `AY${currentYear.toString().padStart(2, '0')}/${nextYear.toString().padStart(2, '0')}`;
    
    semesters.push(`${ayString} Sem 1`);
    semesters.push(`${ayString} Sem 2`);
    semesters.push(`${ayString} ST1`);
    semesters.push(`${ayString} ST2`);
  }
  return semesters;
};

// Custom hooks
const useLocalStorage = (key, defaultValue) => {
  const [value, setValue] = useState(() => loadFromStorage(key, defaultValue));
  
  useEffect(() => {
    saveToStorage(key, value);
  }, [key, value]);
  
  return [value, setValue];
};

const useGPACalculations = (selectedModules) => {
  return useMemo(() => {
    let totalPoints = 0;
    let totalGradedMCs = 0;
    let totalMCs = 0;

    selectedModules.forEach(module => {
      const moduleCredit = Number(module.moduleCredit) || 0;
      totalMCs += moduleCredit;
      
      if (module.isSU && module.letterGrade && module.letterGrade !== 'CS' && module.letterGrade !== 'CU') {
        return;
      }
      
      const grade = module.letterGrade;
      
      if (grade && moduleCredit > 0) {
        const points = GRADE_POINTS[grade];
        
        if (points !== null) {
          totalPoints += points * moduleCredit;
          totalGradedMCs += moduleCredit;
        }
      }
    });

    const gpa = totalGradedMCs > 0 ? totalPoints / totalGradedMCs : 0;
    return { 
      gpa: Number(gpa.toFixed(2)), 
      totalMCs, 
      gradedMCs: totalGradedMCs 
    };
  }, [selectedModules]);
};

const useSUCalculations = (selectedModules, allSemesters, hasAPCs) => {
  return useMemo(() => {
    const firstTwoSemesters = allSemesters.filter(sem => !sem.includes('ST')).slice(0, 2);
    const subsequentSemesters = allSemesters.filter(sem => !firstTwoSemesters.includes(sem));
    
    let firstTwoSUUsed = 0;
    let subsequentSUUsed = 0;
    
    selectedModules.forEach(module => {
      if (module.isSU && module.letterGrade && module.letterGrade !== 'CS' && module.letterGrade !== 'CU') {
        const moduleCredit = Number(module.moduleCredit) || 0;
        if (firstTwoSemesters.includes(module.semester)) {
          firstTwoSUUsed += moduleCredit;
        } else if (subsequentSemesters.includes(module.semester)) {
          subsequentSUUsed += moduleCredit;
        }
      }
    });

    const maxFirstTwo = hasAPCs ? 20 : 32;
    const firstTwoRemaining = Math.max(0, maxFirstTwo - firstTwoSUUsed);
    
    const maxSubsequent = Math.min(firstTwoRemaining, 12);
    const subsequentRemaining = Math.max(0, maxSubsequent - subsequentSUUsed);
    
    const firstTwoSlots = Math.floor(firstTwoRemaining / 4);
    const subsequentSlots = Math.floor(subsequentRemaining / 4);

    return {
      firstTwoSUUsed,
      subsequentSUUsed,
      firstTwoSlots,
      subsequentSlots,
      maxFirstTwo,
      maxSubsequent,
      firstTwoRemaining,
      subsequentRemaining
    };
  }, [selectedModules, allSemesters, hasAPCs]);
};

const useModuleAPI = () => {
  const [modules, setModules] = useState([]);
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState(null);

  const fetchModules = useCallback(async () => {
    try {
      setApiError(null);
      const response = await fetch('https://api.nusmods.com/v2/2024-2025/moduleList.json');
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      const data = await response.json();
      setModules(data);
    } catch (error) {
      console.error('Error fetching modules:', error);
      setApiError('Failed to load module list. Please check your connection and refresh.');
    }
  }, []);

  const fetchModuleDetails = useCallback(async (moduleCode) => {
    setLoading(true);
    try {
      const response = await fetch(`https://api.nusmods.com/v2/2024-2025/modules/${moduleCode}.json`);
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      return await response.json();
    } catch (error) {
      console.error('Error fetching module details:', error);
      setApiError('Failed to add module. Please try again.');
      throw error;
    } finally {
      setLoading(false);
    }
  }, []);

  return { modules, loading, apiError, fetchModules, fetchModuleDetails };
};

// Components
const ErrorBoundary = ({ children }) => {
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    const handleError = () => setHasError(true);
    window.addEventListener('error', handleError);
    return () => window.removeEventListener('error', handleError);
  }, []);

  if (hasError) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white p-8 rounded-lg shadow-lg max-w-md">
          <h2 className="text-xl font-bold text-red-600 mb-4">Something went wrong</h2>
          <p className="text-gray-600 mb-4">The app encountered an error. Please refresh the page.</p>
          <button 
            onClick={() => window.location.reload()} 
            className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
          >
            Refresh Page
          </button>
        </div>
      </div>
    );
  }
  return children;
};

const GradeSelector = ({ module, onGradeSelect, onClose }) => {
  const gradeRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (gradeRef.current && !gradeRef.current.contains(event.target)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  return (
    <div ref={gradeRef} className="bg-white border border-gray-300 rounded shadow-lg p-2 w-full">
      {GRADE_GRID.map((row, rowIndex) => (
        <div key={rowIndex} className="flex gap-1 mb-1 last:mb-0">
          {row.map((grade, colIndex) => (
            grade ? (
              <button
                key={grade}
                type="button"
                onClick={() => onGradeSelect(grade)}
                className="px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-100 
                         flex-1 text-center transition-colors font-medium bg-white"
              >
                {grade}
              </button>
            ) : (
              <div key={colIndex} className="flex-1"></div>
            )
          ))}
        </div>
      ))}
    </div>
  );
};

const ModuleCard = ({ 
  module, 
  onRemove, 
  onLetterGradeUpdate, 
  onToggleSU,
  onDragStart,
  onDragEnd,
  isBeingDragged,
  shouldMoveDown,
  shouldMoveUp,
  isSpecialTerm,
  hideGrades = false
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [showGradeSelector, setShowGradeSelector] = useState(false);
  const [longPressTimer, setLongPressTimer] = useState(null);

  const handleDragStart = (e) => {
    setIsDragging(true);
    onDragStart(module.id);
    e.dataTransfer.setData('application/json', JSON.stringify(module));
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragEnd = () => {
    setIsDragging(false);
    onDragEnd();
  };

  const handleGradeClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setShowGradeSelector(!showGradeSelector);
  };

  const handleGradeSelect = (grade) => {
    onLetterGradeUpdate(module.id, grade);
    setShowGradeSelector(false);
  };

  const handleContextMenu = (e) => {
    e.preventDefault();
    if (module.letterGrade && module.letterGrade !== 'CS' && module.letterGrade !== 'CU') {
      onToggleSU(module.id);
    }
  };

  const handleTouchStart = (e) => {
    if (module.letterGrade && module.letterGrade !== 'CS' && module.letterGrade !== 'CU') {
      const timer = setTimeout(() => {
        onToggleSU(module.id);
      }, 500);
      setLongPressTimer(timer);
    }
  };

  const handleTouchEnd = () => {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      setLongPressTimer(null);
    }
  };

  const cardBgClass = isSpecialTerm ? "bg-blue-100" : "bg-green-100";
  const textClasses = isSpecialTerm 
    ? { title: "text-blue-800", subtitle: "text-blue-700", meta: "text-blue-600" }
    : { title: "text-green-800", subtitle: "text-green-700", meta: "text-green-600" };

  const displayGrade = () => {
    if (hideGrades) return '***';
    if (!module.letterGrade) return 'Grade';
    if (module.isSU) {
      return module.letterGrade === 'F' ? 'U' : 'S';
    }
    return module.letterGrade;
  };

  const isPlaceholder = !module.letterGrade;

  return (
    <div 
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onContextMenu={handleContextMenu}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      data-module-id={module.id}
      className={`${cardBgClass} rounded-lg p-3 relative group cursor-move transition-all duration-200 ease-in-out
                 ${isDragging ? 'invisible' : 'hover:scale-[1.02]'}
                 ${shouldMoveDown ? 'transform translate-y-16' : ''}
                 ${shouldMoveUp ? 'transform -translate-y-16' : ''}`}
    >
      <button
        onClick={() => onRemove(module.id)}
        className="absolute top-1 right-1 text-red-500 opacity-0 group-hover:opacity-100 transition-opacity z-[5]"
      >
        <X className="w-3 h-3" />
      </button>
      
      <div className="flex justify-between items-start">
        <div className="flex-1 min-w-0 pr-3">
          <div className={`font-semibold text-sm ${textClasses.title}`}>{module.moduleCode}</div>
          <div className={`text-xs ${textClasses.subtitle} mb-1 line-clamp-2`}>{module.title}</div>
          <div className={`text-xs ${textClasses.meta}`}>{module.moduleCredit} Units</div>
        </div>
        
        {!hideGrades && (
          <div className="w-32 relative -ml-8 sm:-ml-4">
            {!showGradeSelector && (
              <button
                onClick={handleGradeClick}
                className={`w-full px-3 py-2 border border-gray-300 rounded text-base font-bold
                           bg-white hover:bg-gray-50 transition-colors cursor-pointer
                           ${module.isSU ? 'bg-blue-100 border-blue-300' : ''}
                           ${showGradeSelector ? 'ring-2 ring-blue-300' : ''}
                           ${isPlaceholder ? 'text-gray-400' : 'text-gray-900'}`}
              >
                {displayGrade()}
              </button>
            )}
            
            {showGradeSelector && (
              <GradeSelector
                module={module}
                onGradeSelect={handleGradeSelect}
                onClose={() => setShowGradeSelector(false)}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
};

const ModuleSearch = ({ 
  semester, 
  searchTerm, 
  searchResults, 
  loading,
  onSearch, 
  onAddModule,
  selectedModules 
}) => (
  <div className="mt-3 p-3 bg-gray-50 rounded-lg">
    <div className="relative">
      <input
        type="text"
        value={searchTerm}
        onChange={(e) => onSearch(e.target.value)}
        placeholder="Search module..."
        className="w-full p-2 border border-gray-300 rounded text-sm bg-white text-gray-900"
      />
      
      {searchResults.length > 0 && (
        <div className="absolute z-30 w-full bg-white border border-gray-300 rounded mt-1 max-h-48 overflow-y-auto">
          {searchResults.map((module) => {
            const isAlreadyTaken = selectedModules.some(m => m.moduleCode === module.moduleCode);
            return (
              <button
                key={module.moduleCode}
                onClick={() => !isAlreadyTaken && onAddModule(module.moduleCode, semester)}
                className={`w-full text-left p-2 border-b last:border-b-0 border-gray-200 transition-colors
                  ${isAlreadyTaken 
                    ? 'opacity-50 cursor-not-allowed bg-gray-100' 
                    : 'hover:bg-gray-100 cursor-pointer'
                  }`}
                disabled={loading || isAlreadyTaken}
              >
                <div className={`font-semibold text-sm ${isAlreadyTaken ? 'text-gray-400' : 'text-gray-900'}`}>
                  {module.moduleCode} {isAlreadyTaken && '(Already taken)'}
                </div>
                <div className={`text-xs truncate ${isAlreadyTaken ? 'text-gray-400' : 'text-gray-600'}`}>
                  {module.title}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  </div>
);

const SemesterCard = ({ 
  semester, 
  modules, 
  onRemoveSemester,
  onRemoveModule,
  onLetterGradeUpdate,
  onToggleSU,
  onMoveModule,
  showModuleSearch,
  setShowModuleSearch,
  searchTerm,
  searchResults,
  loading,
  onSearch,
  onAddModule,
  calculateSemesterGPA,
  calculateSemesterSU,
  selectedModules,
  isSpecialTerm = false,
  hideGrades = false
}) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const [draggedModuleId, setDraggedModuleId] = useState(null);
  const [dragInsertIndex, setDragInsertIndex] = useState(-1);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  
  const semesterMCs = useMemo(() => 
    modules.reduce((sum, module) => sum + (Number(module.moduleCredit) || 0), 0),
    [modules]
  );

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setIsDragOver(true);
    
    const dropY = e.clientY;
    const moduleElements = Array.from(e.currentTarget.querySelectorAll('[data-module-id]'));
    let insertIndex = modules.length;
    
    for (let i = 0; i < moduleElements.length; i++) {
      const rect = moduleElements[i].getBoundingClientRect();
      const elementCenter = rect.top + rect.height / 2;
      
      if (dropY < elementCenter) {
        insertIndex = i;
        break;
      }
    }
    
    setDragInsertIndex(insertIndex);
  };

  const handleDragLeave = (e) => {
    if (!e.currentTarget.contains(e.relatedTarget)) {
      setIsDragOver(false);
      setDragInsertIndex(-1);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    setDraggedModuleId(null);
    setDragInsertIndex(-1);
    
    try {
      const moduleData = JSON.parse(e.dataTransfer.getData('application/json'));
      const dropY = e.clientY;
      
      const moduleElements = Array.from(e.currentTarget.querySelectorAll('[data-module-id]'));
      let insertIndex = modules.length;
      
      for (let i = 0; i < moduleElements.length; i++) {
        const rect = moduleElements[i].getBoundingClientRect();
        const elementCenter = rect.top + rect.height / 2;
        
        if (dropY < elementCenter) {
          insertIndex = i;
          break;
        }
      }
      
      onMoveModule(moduleData.id, semester, insertIndex);
    } catch (error) {
      console.error('Error handling drop:', error);
    }
  };

  const handleModuleDragStart = (moduleId) => {
    setDraggedModuleId(moduleId);
  };

  const handleModuleDragEnd = () => {
    setDraggedModuleId(null);
    setDragInsertIndex(-1);
  };

  const handleDeleteClick = () => {
    setShowDeleteConfirm(true);
  };

  const handleConfirmDelete = () => {
    onRemoveSemester(semester);
    setShowDeleteConfirm(false);
  };

  const handleCancelDelete = () => {
    setShowDeleteConfirm(false);
  };

  const cardClass = showDeleteConfirm 
    ? 'bg-red-50 border-red-200 rounded-lg shadow-lg p-4 border transition-colors'
    : isSpecialTerm 
    ? `bg-blue-50 rounded-lg shadow-lg p-4 border transition-colors ${
        isDragOver ? 'border-blue-400 bg-blue-100' : 'border-blue-200'
      }`
    : `bg-white rounded-lg shadow-lg p-4 border transition-colors ${
        isDragOver ? 'border-green-400 bg-green-50' : 'border-gray-200'
      }`;

  const titleClass = isSpecialTerm ? "text-blue-800" : "text-gray-800";

  return (
    <div 
      className={cardClass}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {showDeleteConfirm ? (
        <div className="flex flex-col items-center justify-center min-h-[200px] text-center">
          <AlertTriangle className="w-8 h-8 text-red-600 mb-3" />
          <h4 className="font-semibold text-red-800 text-lg mb-2">Delete {semester}?</h4>
          <p className="text-sm text-red-700 mb-6">
            This will remove all modules in this semester.
          </p>
          <div className="flex gap-3">
            <button
              onClick={handleCancelDelete}
              className="px-4 py-2 text-sm border border-gray-300 rounded hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirmDelete}
              className="px-4 py-2 text-sm bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
            >
              Delete
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="mb-4">
            <div className="flex justify-between items-start mb-2">
              <h3 className={`font-bold text-lg ${titleClass}`}>{semester}</h3>
              <button
                onClick={handleDeleteClick}
                className="text-red-500 hover:bg-red-100 p-1 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex justify-between items-center">
              <p className={`text-sm ${isSpecialTerm ? 'text-blue-600' : 'text-gray-600'}`}>
                {modules.length} Courses • {semesterMCs} Units
              </p>
              <div className="text-right">
                {!hideGrades && (
                  <>
                    <p className="text-sm font-semibold text-orange-600">
                      GPA: {calculateSemesterGPA(semester)}
                    </p>
                    {calculateSemesterSU(semester) > 0 && (
                      <p className="text-xs text-blue-600">
                        S/U: {calculateSemesterSU(semester)} MCs
                      </p>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-3 mb-4 min-h-[60px]">
            {modules.length === 0 && isDragOver && (
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center">
                <p className="text-gray-500">Drop module here</p>
              </div>
            )}
            
            {modules.map((module, index) => {
              const draggedIndex = modules.findIndex(m => m.id === draggedModuleId);
              const shouldMoveDown = draggedModuleId && draggedModuleId !== module.id && 
                                    dragInsertIndex !== -1 && draggedIndex > index && index >= dragInsertIndex;
              const shouldMoveUp = draggedModuleId && draggedModuleId !== module.id && 
                                  dragInsertIndex !== -1 && draggedIndex < index && index < dragInsertIndex;
              
              return (
                <ModuleCard
                  key={module.id}
                  module={module}
                  onRemove={onRemoveModule}
                  onLetterGradeUpdate={onLetterGradeUpdate}
                  onToggleSU={onToggleSU}
                  onDragStart={handleModuleDragStart}
                  onDragEnd={handleModuleDragEnd}
                  isBeingDragged={draggedModuleId === module.id}
                  shouldMoveDown={shouldMoveDown}
                  shouldMoveUp={shouldMoveUp}
                  isSpecialTerm={isSpecialTerm}
                  hideGrades={hideGrades}
                />
              );
            })}
          </div>

          <button
            onClick={() => setShowModuleSearch(showModuleSearch === semester ? null : semester)}
            className={`w-full p-2 border-2 border-dashed rounded-lg transition-colors flex items-center justify-center gap-2 ${
              isSpecialTerm 
                ? 'border-blue-300 text-blue-500 hover:border-blue-400 hover:text-blue-600'
                : 'border-gray-300 text-gray-500 hover:border-orange-300 hover:text-orange-500'
            }`}
          >
            <Plus className="w-4 h-4" />
            Add Courses
          </button>

          {showModuleSearch === semester && (
            <ModuleSearch
              semester={semester}
              searchTerm={searchTerm}
              searchResults={searchResults}
              loading={loading}
              onSearch={onSearch}
              onAddModule={onAddModule}
              selectedModules={selectedModules}
            />
          )}
        </>
      )}
    </div>
  );
};

const Sidebar = ({ 
  academicSettings, 
  onUpdateMatricYear, 
  onToggleAPCs,
  suData,
  visibleYears,
  selectedYear,
  onSelectYear,
  onRemoveYear,
  onAddYear,
  semestersByYear,
  hideGrades = false
}) => (
  <div className="w-full lg:w-56 bg-white shadow-lg p-4 border-b lg:border-r lg:border-b-0 border-gray-200">
    <h3 className="font-semibold text-gray-800 mb-3">Matriculation Year</h3>
    <div className="mb-4">
      <select
        value={academicSettings.matricYear}
        onChange={(e) => onUpdateMatricYear(e.target.value)}
        className="w-full p-2 border border-gray-300 rounded text-sm bg-white text-gray-900"
      >
        {MATRIC_YEAR_OPTIONS.map(year => (
          <option key={year} value={year}>{year}</option>
        ))}
      </select>
    </div>

    <div className="mb-4">
      <label className="flex items-center gap-2 text-sm text-gray-700">
        <input
          type="checkbox"
          checked={academicSettings.hasAPCs}
          onChange={onToggleAPCs}
          className="rounded"
        />
        20+ APCs (reduces S/U to 20 MCs)
      </label>
    </div>

    <div className="mb-4 p-3 bg-blue-50 rounded-lg">
      <h4 className="font-semibold text-sm text-blue-800 mb-2">S/U Options</h4>
      <p className="text-xs text-blue-600">
        First 2 sems: {hideGrades ? '***' : `${suData.firstTwoSlots} slots (${suData.firstTwoRemaining}/${suData.maxFirstTwo} MCs)`}
      </p>
      <p className="text-xs text-blue-600">
        Subsequent: {hideGrades ? '***' : `${suData.subsequentSlots} slots (${suData.subsequentRemaining}/${suData.maxSubsequent} MCs)`}
      </p>
    </div>

    <h3 className="font-semibold text-gray-800 mb-3">Academic Years</h3>
    <div className="space-y-1 mb-4">
      {visibleYears.map(year => (
        <div key={year} className="flex items-center group">
          <button
            onClick={() => onSelectYear(year)}
            className={`flex-1 text-left p-2 rounded text-sm transition-colors ${
              selectedYear === year 
                ? 'bg-orange-100 text-orange-700 font-medium' 
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            {year}
          </button>
          <button
            onClick={() => onRemoveYear(year)}
            className="p-1 text-red-500 opacity-0 group-hover:opacity-100 hover:bg-red-100 rounded transition-opacity ml-1"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      ))}
      
      {Object.keys(semestersByYear).length > visibleYears.length && (
        <button
          onClick={onAddYear}
          className="w-full text-left p-2 text-xs text-gray-500 hover:bg-gray-100 rounded transition-colors border border-dashed border-gray-300"
        >
          + Add Academic Year
        </button>
      )}
    </div>
  </div>
);

const GPASummary = ({ gpaData, hideGrades, onToggleHideGrades }) => (
  <div className="flex items-center gap-3">
    <button
      onClick={onToggleHideGrades}
      className="p-2 rounded-lg hover:bg-gray-100 transition-colors text-gray-600"
      title={hideGrades ? "Show grades" : "Hide grades"}
    >
      {hideGrades ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
    </button>
    
    <div className="flex flex-wrap gap-2 md:gap-4 items-center">
      <div className="bg-orange-100 rounded-lg px-3 md:px-4 py-2 text-center">
        <div className="text-xl md:text-2xl font-bold text-orange-600">
          {hideGrades ? '***' : gpaData.gpa.toFixed(2)}
        </div>
        <div className="text-xs text-gray-600">Cumulative GPA</div>
      </div>
      <div className="bg-blue-100 rounded-lg px-3 md:px-4 py-2 text-center">
        <div className="text-xl md:text-2xl font-bold text-blue-600">
          {gpaData.gradedMCs}
        </div>
        <div className="text-xs text-gray-600">Graded MCs</div>
      </div>
      <div className="bg-green-100 rounded-lg px-3 md:px-4 py-2 text-center">
        <div className="text-xl md:text-2xl font-bold text-green-600">
          {gpaData.totalMCs}
        </div>
        <div className="text-xs text-gray-600">Total MCs</div>
      </div>
    </div>
  </div>
);

const NotificationPopup = ({ message, isVisible, onHide }) => {
  useEffect(() => {
    if (isVisible) {
      const timer = setTimeout(onHide, 4000);
      return () => clearTimeout(timer);
    }
  }, [isVisible, onHide]);

  if (!isVisible) return null;
  
  return (
    <div className="fixed bottom-4 right-4 bg-red-100 border border-red-300 text-red-800 text-sm px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 opacity-95 z-50">
      <AlertTriangle className="w-4 h-4 text-red-600" />
      <div className="flex-1">{message}</div>
      <button 
        onClick={onHide}
        className="text-red-600 hover:text-red-800 transition-colors"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
};

const SUHint = ({ showHint, onHide }) => {
  if (!showHint) return null;
  
  return (
    <div className="fixed bottom-4 right-4 bg-yellow-200 text-yellow-800 text-xs px-3 py-2 rounded-lg shadow-lg flex items-center gap-2 opacity-90">
      <Info className="w-4 h-4" />
      <div>
        <div className="hidden md:block">Right-click to S/U mod</div>
        <div className="md:hidden">Long press to S/U mod</div>
      </div>
      <button 
        onClick={onHide}
        className="text-yellow-800 hover:text-yellow-600 transition-colors"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
};

const NUSModsAcknowledgement = () => (
  <div className="fixed bottom-4 left-4 text-xs text-gray-500 z-40">
    <p>
      Module data from{' '}
      <a 
        href="https://nusmods.com" 
        target="_blank" 
        rel="noopener noreferrer"
        className="text-blue-500 hover:text-blue-600 underline"
      >
        NUSMods
      </a>
    </p>
  </div>
);

// Main component
const NUSGPACalculator = () => {
  const [selectedModules, setSelectedModules] = useLocalStorage(STORAGE_KEYS.SELECTED_MODULES, []);
  const [academicSettings, setAcademicSettings] = useLocalStorage(STORAGE_KEYS.ACADEMIC_SETTINGS, { matricYear: 'AY24/25', hasAPCs: false });
  const [activeSemesters, setActiveSemesters] = useLocalStorage(STORAGE_KEYS.ACTIVE_SEMESTERS, []);
  const [selectedYear, setSelectedYear] = useLocalStorage(STORAGE_KEYS.SELECTED_YEAR, '');
  const [visibleYears, setVisibleYears] = useLocalStorage(STORAGE_KEYS.VISIBLE_YEARS, []);
  const [showHint, setShowHint] = useLocalStorage(STORAGE_KEYS.SHOW_HINT, true);
  const [hideGrades, setHideGrades] = useLocalStorage(STORAGE_KEYS.HIDE_GRADES, false);

  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [showModuleSearch, setShowModuleSearch] = useState(null);
  const [notificationMessage, setNotificationMessage] = useState('');
  const [showNotification, setShowNotification] = useState(false);

  const { modules, loading, apiError, fetchModules, fetchModuleDetails } = useModuleAPI();

  const allSemesters = useMemo(() => 
    generateAllSemesters(academicSettings.matricYear), 
    [academicSettings.matricYear]
  );
  
  const semestersByYear = useMemo(() => 
    allSemesters.reduce((groups, semester) => {
      const year = semester.split(' ')[0];
      if (!groups[year]) groups[year] = [];
      groups[year].push(semester);
      return groups;
    }, {}), 
    [allSemesters]
  );

  const currentYearSemesters = useMemo(() => 
    selectedYear ? semestersByYear[selectedYear] || [] : [], 
    [selectedYear, semestersByYear]
  );

  const activeCurrentYearSemesters = useMemo(() => 
    currentYearSemesters.filter(sem => activeSemesters.includes(sem)), 
    [currentYearSemesters, activeSemesters]
  );

  const gpaData = useGPACalculations(selectedModules);
  const suData = useSUCalculations(selectedModules, allSemesters, academicSettings.hasAPCs);

  const modulesBySemester = useMemo(() => 
    selectedModules.reduce((groups, module) => {
      const semester = module.semester;
      if (!groups[semester]) groups[semester] = [];
      groups[semester].push(module);
      return groups;
    }, {}), 
    [selectedModules]
  );

  const calculateSemesterGPA = useCallback((semester) => {
    const semesterModules = selectedModules.filter(module => module.semester === semester);
    let semesterPoints = 0;
    let semesterGradedMCs = 0;

    semesterModules.forEach(module => {
      const moduleCredit = Number(module.moduleCredit) || 0;
      
      if (module.isSU && module.letterGrade && module.letterGrade !== 'CS' && module.letterGrade !== 'CU') {
        return;
      }
      
      const grade = module.letterGrade;
      
      if (grade && moduleCredit > 0) {
        const points = GRADE_POINTS[grade];
        if (points !== null) {
          semesterPoints += points * moduleCredit;
          semesterGradedMCs += moduleCredit;
        }
      }
    });

    return semesterGradedMCs > 0 ? (semesterPoints / semesterGradedMCs).toFixed(2) : '0.00';
  }, [selectedModules]);

  const calculateSemesterSU = useCallback((semester) => {
    const semesterModules = selectedModules.filter(module => module.semester === semester);
    return semesterModules.reduce((sum, module) => {
      if (module.isSU && module.letterGrade && module.letterGrade !== 'CS' && module.letterGrade !== 'CU') {
        return sum + (Number(module.moduleCredit) || 0);
      }
      return sum;
    }, 0);
  }, [selectedModules]);

  const handleSearch = useCallback((term) => {
    setSearchTerm(term);
    if (term.length < 2) {
      setSearchResults([]);
      return;
    }
    
    const filtered = modules.filter(module => 
      module.moduleCode.toLowerCase().includes(term.toLowerCase()) ||
      module.title.toLowerCase().includes(term.toLowerCase())
    ).slice(0, 10);
    
    setSearchResults(filtered);
  }, [modules]);

  const addModule = useCallback(async (moduleCode, semester) => {
    if (selectedModules.find(m => m.moduleCode === moduleCode)) return;
    
    try {
      const moduleData = await fetchModuleDetails(moduleCode);
      
      const newModule = {
        moduleCode: moduleData.moduleCode,
        title: moduleData.title,
        moduleCredit: moduleData.moduleCredit,
        letterGrade: '',
        isSU: false,
        semester: semester,
        id: Date.now()
      };
      
      setSelectedModules(prev => [...prev, newModule]);
      setSearchTerm('');
      setSearchResults([]);
      setShowModuleSearch(null);
    } catch (error) {
      // Error handling is done in the hook
    }
  }, [selectedModules, fetchModuleDetails]);

  const updateLetterGrade = useCallback((id, grade) => {
    setSelectedModules(modules => 
      modules.map(module => 
        module.id === id ? { ...module, letterGrade: grade, isSU: false } : module
      )
    );
  }, []);

  const showNotificationMessage = useCallback((message) => {
    setNotificationMessage(message);
    setShowNotification(true);
  }, []);

  const hideNotification = useCallback(() => {
    setShowNotification(false);
  }, []);

  const toggleSU = useCallback((id) => {
    setSelectedModules(modules => {
      const module = modules.find(m => m.id === id);
      if (!module) return modules;

      if (!module.isSU) {
        const moduleCredit = Number(module.moduleCredit) || 0;
        const firstTwoSemesters = allSemesters.filter(sem => !sem.includes('ST')).slice(0, 2);
        const isFirstTwoSem = firstTwoSemesters.includes(module.semester);
        
        if (isFirstTwoSem) {
          if (suData.firstTwoRemaining < moduleCredit) {
            showNotificationMessage(`Not enough S/U credits remaining for first 2 semesters. Available: ${suData.firstTwoRemaining} MCs`);
            return modules;
          }
        } else {
          if (suData.subsequentRemaining < moduleCredit) {
            showNotificationMessage(`Not enough S/U credits remaining for subsequent semesters. Available: ${suData.subsequentRemaining} MCs`);
            return modules;
          }
        }
      }

      return modules.map(m => 
        m.id === id ? { ...m, isSU: !m.isSU } : m
      );
    });
  }, [allSemesters, suData, showNotificationMessage]);

  const removeModule = useCallback((id) => {
    setSelectedModules(modules => modules.filter(module => module.id !== id));
  }, []);

  const moveModule = useCallback((moduleId, targetSemester, insertIndex = null) => {
    setSelectedModules(modules => {
      const moduleToMove = modules.find(m => m.id === moduleId);
      if (!moduleToMove) return modules;
      
      const filteredModules = modules.filter(m => m.id !== moduleId);
      const updatedModule = { ...moduleToMove, semester: targetSemester };
      
      if (insertIndex !== null) {
        const targetSemesterModules = filteredModules.filter(m => m.semester === targetSemester);
        const otherModules = filteredModules.filter(m => m.semester !== targetSemester);
        
        targetSemesterModules.splice(insertIndex, 0, updatedModule);
        return [...otherModules, ...targetSemesterModules];
      } else {
        return [...filteredModules, updatedModule];
      }
    });
  }, []);

  const updateMatricYear = useCallback((matricYear) => {
    setAcademicSettings({ matricYear, hasAPCs: academicSettings.hasAPCs });
    setActiveSemesters([]);
    setSelectedYear('');
    const newAllSemesters = generateAllSemesters(matricYear);
    setSelectedModules(modules => modules.filter(module => newAllSemesters.includes(module.semester)));
  }, [academicSettings.hasAPCs]);

  const toggleAPCs = useCallback(() => {
    setAcademicSettings(prev => ({ ...prev, hasAPCs: !prev.hasAPCs }));
  }, []);

  const addSemester = useCallback((semester) => {
    if (!activeSemesters.includes(semester)) {
      setActiveSemesters(prev => [...prev, semester]);
    }
  }, [activeSemesters]);

  const removeSemester = useCallback((semester) => {
    setActiveSemesters(prev => prev.filter(sem => sem !== semester));
    setSelectedModules(prev => prev.filter(module => module.semester !== semester));
  }, []);

  const removeAcademicYear = useCallback((year) => {
    const yearSemesters = semestersByYear[year] || [];
    setActiveSemesters(prev => prev.filter(sem => !yearSemesters.includes(sem)));
    setSelectedModules(prev => prev.filter(module => !yearSemesters.includes(module.semester)));
    const newVisibleYears = visibleYears.filter(y => y !== year);
    setVisibleYears(newVisibleYears);
    if (selectedYear === year) {
      setSelectedYear(newVisibleYears[0] || '');
    }
  }, [semestersByYear, visibleYears, selectedYear]);

  const addAcademicYear = useCallback(() => {
    const allYears = Object.keys(semestersByYear);
    const nextYear = allYears.find(year => !visibleYears.includes(year));
    if (nextYear) {
      setVisibleYears(prev => [...prev, nextYear]);
    }
  }, [semestersByYear, visibleYears]);

  const toggleHideGrades = useCallback(() => {
    setHideGrades(prev => !prev);
  }, []);

  useEffect(() => {
    fetchModules();
  }, [fetchModules]);

  useEffect(() => {
    const allYears = Object.keys(semestersByYear);
    if (allYears.length > 0) {
      const currentYear = 'AY24/25';
      const defaultYear = allYears.includes(currentYear) ? currentYear : allYears[0];
      
      if (visibleYears.length === 0) {
        setVisibleYears([defaultYear]);
        setSelectedYear(defaultYear);
      } else if (!selectedYear && visibleYears.length > 0) {
        setSelectedYear(visibleYears[0]);
      }
    }
  }, [semestersByYear, visibleYears, selectedYear]);

  useEffect(() => {
    if (selectedYear && semestersByYear[selectedYear]) {
      const regularSemesters = semestersByYear[selectedYear].filter(sem => !sem.includes('ST'));
      const missingRegularSemesters = regularSemesters.filter(sem => !activeSemesters.includes(sem));
      if (missingRegularSemesters.length > 0) {
        setActiveSemesters(prev => [...prev, ...missingRegularSemesters]);
      }
    }
  }, [selectedYear, semestersByYear, activeSemesters]);

  if (apiError) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white p-8 rounded-lg shadow-lg max-w-md">
          <h2 className="text-xl font-bold text-red-600 mb-4">Connection Error</h2>
          <p className="text-gray-600 mb-4">{apiError}</p>
          <button 
            onClick={fetchModules} 
            className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col lg:flex-row transition-colors">
      <Sidebar
        academicSettings={academicSettings}
        onUpdateMatricYear={updateMatricYear}
        onToggleAPCs={toggleAPCs}
        suData={suData}
        visibleYears={visibleYears}
        selectedYear={selectedYear}
        onSelectYear={setSelectedYear}
        onRemoveYear={removeAcademicYear}
        onAddYear={addAcademicYear}
        semestersByYear={semestersByYear}
        hideGrades={hideGrades}
      />

      <div className="flex-1 p-4 relative">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col md:flex-row md:justify-between md:items-center mb-6 gap-4">
            <h1 className="text-2xl md:text-3xl font-bold text-orange-600">
              NUS StudyBoard
            </h1>
            <GPASummary gpaData={gpaData} hideGrades={hideGrades} onToggleHideGrades={toggleHideGrades} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 md:gap-6">
            {activeCurrentYearSemesters.filter(sem => !sem.includes('ST')).map((semester) => (
              <SemesterCard
                key={semester}
                semester={semester}
                modules={modulesBySemester[semester] || []}
                onRemoveSemester={removeSemester}
                onRemoveModule={removeModule}
                onLetterGradeUpdate={updateLetterGrade}
                onToggleSU={toggleSU}
                onMoveModule={moveModule}
                showModuleSearch={showModuleSearch}
                setShowModuleSearch={setShowModuleSearch}
                searchTerm={searchTerm}
                searchResults={searchResults}
                loading={loading}
                onSearch={handleSearch}
                onAddModule={addModule}
                calculateSemesterGPA={calculateSemesterGPA}
                calculateSemesterSU={calculateSemesterSU}
                selectedModules={selectedModules}
                hideGrades={hideGrades}
              />
            ))}

            {(() => {
              const specialTerms = currentYearSemesters.filter(sem => sem.includes('ST'));
              const activeSpecialTerms = specialTerms.filter(sem => activeSemesters.includes(sem));
              const inactiveSpecialTerms = specialTerms.filter(sem => !activeSemesters.includes(sem));
              
              if (activeSpecialTerms.length > 0 || inactiveSpecialTerms.length > 0) {
                return (
                  <div className="space-y-4">
                    {activeSpecialTerms.map(semester => (
                      <SemesterCard
                        key={semester}
                        semester={semester}
                        modules={modulesBySemester[semester] || []}
                        onRemoveSemester={removeSemester}
                        onRemoveModule={removeModule}
                        onLetterGradeUpdate={updateLetterGrade}
                        onToggleSU={toggleSU}
                        onMoveModule={moveModule}
                        showModuleSearch={showModuleSearch}
                        setShowModuleSearch={setShowModuleSearch}
                        searchTerm={searchTerm}
                        searchResults={searchResults}
                        loading={loading}
                        onSearch={handleSearch}
                        onAddModule={addModule}
                        calculateSemesterGPA={calculateSemesterGPA}
                        calculateSemesterSU={calculateSemesterSU}
                        selectedModules={selectedModules}
                        isSpecialTerm={true}
                        hideGrades={hideGrades}
                      />
                    ))}

                    {inactiveSpecialTerms.map(semester => (
                      <div key={`add-${semester}`} 
                           className="bg-white rounded-lg shadow-lg p-4 border-2 border-dashed border-gray-300">
                        <button
                          onClick={() => addSemester(semester)}
                          className="w-full h-24 flex flex-col items-center justify-center text-gray-500 hover:text-blue-500 transition-colors"
                        >
                          <Plus className="w-6 h-6 mb-2" />
                          <span className="font-medium">Add {semester.split(' ').slice(1).join(' ')}</span>
                        </button>
                      </div>
                    ))}
                  </div>
                );
              }
              return null;
            })()}
          </div>
        </div>

        <SUHint showHint={showHint} onHide={() => setShowHint(false)} />
        <NotificationPopup 
          message={notificationMessage} 
          isVisible={showNotification} 
          onHide={hideNotification} 
        />
        <NUSModsAcknowledgement />
      </div>
    </div>
  );
};

const App = () => (
  <ErrorBoundary>
    <NUSGPACalculator />
  </ErrorBoundary>
);

export default App;