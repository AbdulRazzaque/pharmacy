import React, { useState } from 'react'

import Addloactaion from './Addloactaion'
import Addproducts from './Addproducts'
import Addsuppliers from './Addsuppliers'
import AdminPanel from '../auth/admin/AdminPanel'
import InventoryNavbar from '../Navbar/InventoryNavbar'
const Addgroups = () => {
  const [text,setText]=useState(<AdminPanel/>)
  return (
    <div>
     <InventoryNavbar />
<div className='flex items-center justify-center mt-4'>
 
  <button className="flex px-3 py-2 bg-blue-400 mr-1 text-white font-semibold rounded"  onClick={()=> setText(<AdminPanel/>)}>
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-6 h-6">
        <path strokeLinecap="round" strokeLinejoin="round" d="M17.982 18.725A7.488 7.488 0 0012 15.75a7.488 7.488 0 00-5.982 2.975m11.963 0a9 9 0 10-11.963 0m11.963 0A8.966 8.966 0 0112 21a8.966 8.966 0 01-5.982-2.275M15 9.75a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
        <span className="ml-1">Add user</span>
    </button>
    

   <button className="flex px-3 py-2 bg-red-400 mr-1 text-white font-semibold rounded"  onClick={()=> setText(<Addproducts/>)}>
   <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-6 h-6">
  <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m8.25 3v6.75m0 0l-3-3m3 3l3-3M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
</svg>

        <span className="ml-1">Add Products</span>
    </button>



    <button className="flex px-3 py-2 bg-orange-400 text-white font-semibold rounded"  onClick={()=> setText(<Addsuppliers/>)}>
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-6 h-6">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v6m3-3H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg> 

        <span className="ml-1 ">Add supplier</span>
    </button>
 <button className="flex px-3 mx-2 py-2 bg-red-400 text-white font-semibold rounded"  onClick={()=> setText(<Addloactaion/>)}>
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-6 h-6">
  <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
  </svg>

        <span className="ml-1">Add Location</span>
    </button> 
    
</div>
<div>
  {text}
</div>
    </div>
  )
}

export default Addgroups