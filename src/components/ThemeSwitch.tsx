import React from 'react';

interface ThemeSwitchProps {
  isDark: boolean;
  onToggle: () => void;
}

const ThemeSwitch: React.FC<ThemeSwitchProps> = ({ isDark, onToggle }) => {
  return (
    <div className="fixed top-4 right-4 z-50 safe-area-top">
      <div className="relative w-[100px] h-[50px]">
        <label className="absolute w-full h-[50px] bg-[#28292c] rounded-[25px] cursor-pointer border-3 border-[#28292c] transition-all duration-300">
          <input 
            type="checkbox" 
            className="absolute hidden" 
            checked={!isDark}
            onChange={onToggle}
          />
          <span className={`absolute w-full h-full rounded-[25px] transition-all duration-300 ${
            isDark ? 'bg-[#28292c]' : 'bg-[#d8dbe0]'
          }`}>
            <span className={`absolute top-[10px] left-[10px] w-[25px] h-[25px] rounded-full transition-all duration-300 ${
              isDark 
                ? 'bg-[#28292c] shadow-[inset_12px_-4px_0px_0px_#d8dbe0]' 
                : 'bg-[#28292c] translate-x-[50px] shadow-none'
            }`} />
          </span>
        </label>
      </div>
    </div>
  );
};

export default ThemeSwitch; 