import axios from 'axios'
import React, { useState } from 'react'

import { useNavigate } from 'react-router-dom'

// import logo from '../../images/inventory.jpg'
import { useForm } from 'react-hook-form'
import { storeUserInfo } from '../../store/user/userActions'
import { connect } from 'react-redux'
import { setToken, setUserInfo } from '../../utils/auth';
import ThemeToggle from '../../components/ThemeToggle';


const AdminLogin = (props) => {
  const navigate = useNavigate();
  const [isValid, setIsValid] = useState(false);
  const { register, handleSubmit } = useForm();
  const onSubmit = async(data) => {
   try {
    await axios.post(`${process.env.REACT_APP_DEVELOPMENT}/api/user/loginUser`, data)
    .then(response=>{
    // console.log(response, 'Heer i cheack adming login')
    if(response.data.result.userInfo.role === "admin"){
      // Save token and user info to localStorage
      setToken(response.data.result.token);
      setUserInfo(response.data.result.userInfo);
      navigate('/dashboard')
      props.storeUserInfo(response.data.result.userInfo)
    }else{
      alert("Only for admin")
    }
  })
  // navigate('/dashboard')
   } catch (error) {
    setIsValid(true);
    setTimeout(() => {
        setIsValid(false);
    }, 3000);
   }

}

  return (
    <div className="relative min-h-screen bg-background">
      <div className="absolute top-4 right-4 z-10">
        <ThemeToggle />
      </div>

  <section className="bg-muted/30 min-h-screen">

  <div className="flex flex-col items-center justify-center px-6 py-8 mx-auto md:h-screen lg:py-0">
  {isValid  &&
  <div role="alert">
  <div className="bg-red-500 text-white font-bold rounded-t px-4 py-2 text-center">
    Error
  </div>
  <div className="border border-t-0 border-red-400 rounded-b bg-red-100 px-4 py-3 text-red-700">
    <p>Cheack Username and password.</p>
  </div>
</div>
      
}
  {/* <div className="flex items-center mb-6 text-2xl font-semibold text-gray-900 dark:text-gray-900 ">
  <img className="w-56 h-32 mr-6 mt-2" src={logo} alt="logo"/>
  </div> */}
  <div className="w-full rounded-lg shadow border border-border md:mt-0 sm:max-w-md xl:p-0 bg-card">
          <div className="p-6 space-y-4 md:space-y-6 sm:p-8">
              <h1 className="text-xl text-center font-bold leading-tight tracking-tight text-foreground md:text-2xl">
                 Admin Login
              </h1>
              <form className="space-y-4 md:space-y-6"  onSubmit={handleSubmit(onSubmit)} >
                  <div>
                      <label htmlFor="email" className="block mb-2 text-sm font-medium text-foreground">User Name</label>
                      <input type="text" {...register("userName", { required: true })} id="email" className="bg-background border border-input text-foreground sm:text-sm rounded-lg focus:ring-primary focus:border-primary block w-full p-2.5" placeholder="name@company.com" required />
                  </div>
                  <div>
                      <label htmlFor="password" className="block mb-2 text-sm font-medium text-foreground">Password</label>
                      <input type="password" {...register("password", { required: true })} id="password" placeholder="••••••••" className="bg-background border border-input text-foreground sm:text-sm rounded-lg focus:ring-primary focus:border-primary block w-full p-2.5" required />
                  </div>
                  <div className="flex items-center justify-between">
                      <div className="flex items-start">
                       
                         
                      </div>

                  </div>
                    
                    <button type="submit" className="w-full text-white bg-blue-600 hover:bg-primary-700 focus:ring-4 focus:outline-none focus:ring-primary-300 font-medium rounded-lg text-sm px-5 py-2.5 text-center dark:bg-primary-600 dark:hover:bg-primary-700 dark:focus:ring-primary-800" >Sign in</button>
                    
            
               
              </form>
          </div>
      </div>
  </div>
</section>
    </div>
  );
}

// const mapStateToProps = ({loading})=>{
//   return {
//       loading
//   }
// }

const mapDispatchToProps = (dispatch)=>{
  return {
    storeUserInfo:value=>dispatch(storeUserInfo(value))
  }
}
export default connect(null,mapDispatchToProps)(AdminLogin)

