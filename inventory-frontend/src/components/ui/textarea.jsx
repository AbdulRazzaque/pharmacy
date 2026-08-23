import * as React from "react"
import { cn } from "../../lib/utils"

const Textarea = React.forwardRef(({ 
  className,
  error,
  maxLength,
  showCount = false,
  ...props 
}, ref) => {
  const [count, setCount] = React.useState(0)

  const handleChange = (e) => {
    setCount(e.target.value.length)
    props.onChange?.(e)
  }

  return (
    <div className="relative w-full">
      <textarea
        className={cn(
          "flex min-h-[100px] w-full rounded-lg border border-input bg-background px-4 py-3 text-sm transition-colors",
          "placeholder:text-muted-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
          "disabled:cursor-not-allowed disabled:opacity-50",
          "hover:border-ring/50",
          "resize-y",
          error && "border-red-500 focus-visible:ring-red-500",
          showCount && maxLength && "pb-8",
          className
        )}
        ref={ref}
        maxLength={maxLength}
        onChange={handleChange}
        {...props}
      />
      {showCount && maxLength && (
        <div className="absolute bottom-2 right-3 text-xs text-muted-foreground">
          {count}/{maxLength}
        </div>
      )}
      {error && (
        <p className="mt-1 text-xs text-red-500">{error}</p>
      )}
    </div>
  )
})
Textarea.displayName = "Textarea"

export { Textarea }
