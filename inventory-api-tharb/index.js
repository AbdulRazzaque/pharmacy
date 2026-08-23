const express = require("express")
const bodyParser = require('body-parser')
const cors = require('cors')
const PORT = process.env.PORT || 4000
const mongoose = require('mongoose')
require('dotenv').config()




const libre = require('libreoffice-convert');
libre.convertAsync = require('util').promisify(libre.convert);

mongoose.connect(process.env.MONGODB)
    .then(res => {
        console.log("connection successful")
    })
    .catch(err => {
        console.log(err)
    })
// const bodyParser = require('body-parser');



const userRouter = require('./router/userRouter')
const productRouter = require('./router/productRouter')
const supplierRouter = require("./router/supplierRouter")
const locationRouter = require("./router/locationRouter")
const stockRouter = require("./router/stockRouter")
const stockInRouter = require("./router/stockInRouter")
const stockOutRouter = require("./router/stockOutRouter")
const stockOutPdfRouter = require("./router/stockOutPdfRouter")
const stockAdjustmentRouter = require("./router/stockAdjustmentRouter")
const reportRouter = require("./router/reportRouter")
const stockHistoryRouter = require("./router/stockHistoryRouter")
const recentActivityRouter = require("./router/recentActivityRouter")
const app = express()
app.use(cors())
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));
app.use('/api/user', userRouter)
app.use('/api/product', productRouter)
app.use('/api/supplier', supplierRouter)
app.use('/api/location', locationRouter)
app.use('/api/stock', stockRouter)
app.use('/api/stockIn', stockInRouter)
app.use('/api/stockOut', stockOutRouter)
app.use('/api/stockOutPdf', stockOutPdfRouter)
app.use('/api/stockAdjustment', stockAdjustmentRouter)
app.use('/api/report', reportRouter)
app.use('/api/stockHistory', stockHistoryRouter)
app.use('/api/recentActivity', recentActivityRouter)



app.listen(PORT, () => {
    console.log(`server started on ${PORT}`)
})