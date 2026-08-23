import * as React from "react"
import { cn } from "../../lib/utils"
import { ChevronDown } from "lucide-react"

const Select = React.forwardRef(({ 
  className, 
  children,
  error,
  placeholder,
  ...props 
}, ref) => {
  return (
    <div className="relative w-full">
      <select
        className={cn(
          "flex h-11 w-full rounded-lg border border-input bg-background px-4 py-2 text-sm transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
          "disabled:cursor-not-allowed disabled:opacity-50",
          "hover:border-ring/50",
          "appearance-none cursor-pointer pr-10",
          error && "border-red-500 focus-visible:ring-red-500",
          className
        )}
        ref={ref}
        {...props}
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {children}
      </select>
      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
      {error && (
        <p className="mt-1 text-xs text-red-500">{error}</p>
      )}
    </div>
  )
})
Select.displayName = "Select"

const SelectOption = React.forwardRef(({ className, ...props }, ref) => {
  return (
    <option
      ref={ref}
      className={cn("py-2", className)}
      {...props}
    />
  )
})
SelectOption.displayName = "SelectOption"

export { Select, SelectOption }
