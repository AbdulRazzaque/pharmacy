import * as React from "react"
import { cn } from "../../lib/utils"

const Label = React.forwardRef(({ className, required, ...props }, ref) => (
  <label
    ref={ref}
    className={cn(
      "text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70",
      "block mb-2",
      className
    )}
    {...props}
  >
    {props.children}
    {required && <span className="text-red-500 ml-1">*</span>}
  </label>
))
Label.displayName = "Label"

export { Label }
