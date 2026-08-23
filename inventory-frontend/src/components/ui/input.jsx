import * as React from "react"
import { cn } from "../../lib/utils"
import { Eye, EyeOff, Search, X } from "lucide-react"

const Input = React.forwardRef(({ 
  className, 
  type, 
  icon: Icon,
  iconPosition = "left",
  clearable = false,
  onClear,
  error,
  ...props 
}, ref) => {
  const [showPassword, setShowPassword] = React.useState(false)
  const inputRef = React.useRef(null)

  React.useImperativeHandle(ref, () => inputRef.current)

  const isPassword = type === "password"
  const inputType = isPassword && showPassword ? "text" : type

  // Only use value/onChange if provided (controlled), else let it be uncontrolled
  const inputProps = { ...props }
  if (typeof props.value !== 'undefined') {
    inputProps.value = props.value
  }
  if (typeof props.onChange !== 'undefined') {
    inputProps.onChange = props.onChange
  }
  // For clearable, only works if controlled
  const handleClear = () => {
    if (props.onChange) {
      const event = { target: { value: "" } }
      props.onChange(event)
    }
    onClear?.()
    if (inputRef.current) {
      inputRef.current.value = ""
      inputRef.current.focus()
    }
  }

  return (
    <div className="relative w-full">
      {Icon && iconPosition === "left" && (
        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
          <Icon className="h-4 w-4" />
        </div>
      )}
      
      <input
        type={inputType}
        className={cn(
          "flex h-11 w-full rounded-lg border border-input bg-background px-4 py-2 text-sm transition-colors",
          "placeholder:text-muted-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
          "disabled:cursor-not-allowed disabled:opacity-50",
          "hover:border-ring/50",
          Icon && iconPosition === "left" && "pl-10",
          (clearable && (props.value || props.defaultValue)) || isPassword ? "pr-10" : Icon && iconPosition === "right" && "pr-10",
          error && "border-red-500 focus-visible:ring-red-500",
          className
        )}
        ref={inputRef}
        {...inputProps}
      />

      {isPassword && (
        <button
          type="button"
          onClick={() => setShowPassword(!showPassword)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
          tabIndex={-1}
        >
          {showPassword ? (
            <EyeOff className="h-4 w-4" />
          ) : (
            <Eye className="h-4 w-4" />
          )}
        </button>
      )}

      {clearable && (typeof props.value !== 'undefined' ? props.value : props.defaultValue) && !isPassword && (
        <button
          type="button"
          onClick={handleClear}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
          tabIndex={-1}
        >
          <X className="h-4 w-4" />
        </button>
      )}

      {Icon && iconPosition === "right" && !clearable && !isPassword && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
          <Icon className="h-4 w-4" />
        </div>
      )}

      {error && (
        <p className="mt-1 text-xs text-red-500">{error}</p>
      )}
    </div>
  )
})
Input.displayName = "Input"

export { Input }
