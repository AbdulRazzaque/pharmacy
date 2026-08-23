import * as React from "react"
import { Label } from "./label"
import { cn } from "../../lib/utils"

const FormField = ({ 
  label, 
  required, 
  error, 
  hint, 
  children,
  className 
}) => {
  return (
    <div className={cn("space-y-2", className)}>
      {label && <Label required={required}>{label}</Label>}
      {children}
      {hint && !error && (
        <p className="text-xs text-muted-foreground">{hint}</p>
      )}
      {error && (
        <p className="text-xs text-red-500">{error}</p>
      )}
    </div>
  )
}

export { FormField }
