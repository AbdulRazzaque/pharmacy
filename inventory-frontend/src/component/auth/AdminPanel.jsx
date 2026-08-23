import React, { useEffect } from 'react'
// import logo from '../../images/inventory.jpg'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import axios from 'axios'
import { getToken } from '../../utils/auth'
import moment from 'moment'
import InventoryNavbar from '../Navbar/InventoryNavbar'
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Select } from '../../components/ui/select';
import { Alert, AlertTitle, AlertDescription } from '../../components/ui/alert';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '../../components/ui/table';
import { Trash2 } from 'lucide-react';
const AdminPanel = () => {
 const [data, setData] = useState([])
 const [isValid, setIsValid] = useState(false);
  const accessToken = getToken();
  const [arrayId,setArrayId] = React.useState([])
  const [flag,setFlag] = React.useState(false)
  const { register, handleSubmit, reset } = useForm();
  const onSubmit = async(data,event) => {
    try {
      await axios.post(`${process.env.REACT_APP_DEVELOPMENT}/api/user/createUser`, data,
      {headers:{token:`${accessToken}`}})
      .then(response=>{
      console.log(response, 'res')
      getAllData()
    })
    setIsValid(true);
    setTimeout(() => {
        setIsValid(false);
    }, 3000);
      reset();
    } catch (error) {
      alert(error)
    }
}

const getAllData=()=>{

      axios.get(`${process.env.REACT_APP_DEVELOPMENT}/api/user`,{headers:{token:accessToken}})
      .then(res=>{
        setData(res.data.result)
      })
}

useEffect(()=>{
  getAllData()
  // eslint-disable-next-line react-hooks/exhaustive-deps
},[])

const handleDelete = (id) => {
  if (arrayId.includes(id)) {
    setArrayId(arrayId.filter((i) => i !== id));
  } else {
    setArrayId([...arrayId, id]);
  }
};

  return (
    <div>
      <InventoryNavbar />
      <section className="bg-gray-50 min-h-screen py-8">
        <div className="container mx-auto px-4 max-w-7xl">
          
          {isValid && (
            <Alert variant="success" className="mb-6">
              <AlertTitle>Success!</AlertTitle>
              <AlertDescription>User created successfully!</AlertDescription>
            </Alert>
          )}

        {/* <div className="flex justify-center mb-6">
        <img className="w-56 h-32" src={logo} alt="logo" />
        </div> */}

          <Card className="max-w-2xl mx-auto mb-8">
            <CardHeader>
              <CardTitle className="text-center">Admin Panel</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="userName">User Name</Label>
                    <Input
                      {...register("userName", { required: true })}
                      id="userName"
                      placeholder="Enter username"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password">Password</Label>
                    <Input
                      {...register("password", { required: true })}
                      type="password"
                      id="password"
                      placeholder="********"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="department">Department</Label>
                  <Select {...register("department")} id="department">
                    <option value="Pharmacy">Pharmacy</option>
                    <option value="Lab">Lab</option>
                    <option value="Hopsital">Hospital</option>
                    <option value="Cleaner">Cleaner</option>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="role">User Role</Label>
                  <Select {...register("role")} id="role">
                    <option value="admin">Admin</option>
                    <option value="user">User</option>
                  </Select>
                </div>

                <Button type="submit" className="w-full">
                  Submit
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex flex-col md:flex-row md:items-center md:justify-between">
                <div>
                  <CardTitle>All Users</CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">
                    {arrayId.length > 0
                      ? `${arrayId.length} user(s) selected`
                      : 'Select users by clicking checkboxes'}
                  </p>
                </div>
                {arrayId.length > 0 && (
                  <Button
                    onClick={() => {
                      if (window.confirm('Delete selected users?')) {
                        axios
                          .post(
                            `${process.env.REACT_APP_DEVELOPMENT}/api/user/deleteUsers`,
                            { array: arrayId },
                            { headers: { token: accessToken } }
                          )
                          .then((res) => {
                            console.log(res);
                            setArrayId([]);
                            setFlag(!flag);
                            getAllData();
                          });
                      }
                    }}
                    variant="destructive"
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete Selected
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[50px]">Select</TableHead>
                    <TableHead>No</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.length > 0 ? (
                    data.map((user, index) => (
                      <TableRow key={user._id}>
                        <TableCell>
                          <input
                            type="checkbox"
                            checked={arrayId.includes(user._id)}
                            onChange={() => handleDelete(user._id)}
                            className="w-4 h-4 cursor-pointer"
                          />
                        </TableCell>
                        <TableCell>{index + 1}</TableCell>
                        <TableCell className="font-medium">{user.userName}</TableCell>
                        <TableCell>{user.department}</TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            user.role === 'admin' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-800'
                          }`}>
                            {user.role}
                          </span>
                        </TableCell>
                        <TableCell>
                          {moment.parseZone(user.createdAt).local().format('DD/MM/YY')}
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground">
                        No users found
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  )
}

export default AdminPanel
