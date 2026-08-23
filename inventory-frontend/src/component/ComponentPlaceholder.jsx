import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card';
import { Alert, AlertDescription } from '../components/ui/alert';
import { AlertCircle } from 'lucide-react';

const ComponentPlaceholder = ({ componentName, message }) => {
  return (
    <div className="container mx-auto p-8">
      <Card>
        <CardHeader>
          <CardTitle>{componentName}</CardTitle>
        </CardHeader>
        <CardContent>
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              {message || `This component (${componentName}) is being updated to use shadcn/ui components. Complex features like advanced data grids and date pickers require additional configuration.`}
            </AlertDescription>
          </Alert>
          <div className="mt-4">
            <p className="text-sm text-muted-foreground">
              To use this feature:
            </p>
            <ul className="list-disc list-inside mt-2 text-sm text-muted-foreground space-y-1">
              <li>Access via the Dashboard: <a href="/dashboard" className="text-primary hover:underline">/dashboard</a></li>
              <li>Or use the navigation menu above</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ComponentPlaceholder;
