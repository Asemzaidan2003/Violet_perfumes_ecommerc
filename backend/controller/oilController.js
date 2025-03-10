import Oil from '../models/oil.model.js';

export const createOil = async (req , res)=>{
    try {
        const {id , oil_name , oil_cost , oil_quantity} = req.body;

        //Validate required fields
        if(!id || !oil_name || !oil_cost || !oil_quantity){
            return res.status(400).json({success:false ,message: "Please provide all required fields" });
        }

        //Create new Oil
        const newOil = new Oil({
            id,
            oil_name,
            oil_cost,
            oil_quantity
        });

        await newOil.save();//we insert the data here
        return res.status(200).json({success:true , message:"Oil data inserted successfully" , data:newOil});
    } catch (error) {
        return res.status(500).json({success:false , message: "Server error", error: error.message });
    }
};

export const updateOil = async (req , res)=>{
    try {
        
        const update = req.body;
        const updatedOil = await Oil.findOneAndUpdate(
            { id: req.params.id },
            update,
            { new: true }
        );
        if(!updatedOil){
            return res.status(404).json({
                success: false,
                message: `No Oil found with this ID: ${id}`,
            });
        }
        return res.status(200).json({
            success:true,
            message:"Oil data updated successfully",
            data:updatedOil
        })
    } catch (error) {
            return res.status(500).json({
            success: false,
            message: `Error updating product: ${error.message}`,
        });
    }
};

export const getOils = async (req,res) => {
    try {
        const oils = await Oil.find({});
        if(oils.length === 0){
            return res.status(404).json({
                success:false,
                message:"No data found",
                data:null
            });
        }
        return res.status(200).json({
            success:true,
            message:"Oils data retrieved successfully",
            data:oils

        })
    } catch (error) {
        res.status(500).json({
            success: false,
            message: `Error getting  oils: ${error.message}`,
        })
    }
};

export const getOilById = async (req,res)=>{
    try {
        const id = req.params.id;
        const oil = await Oil.findOne({id: id});
        if(!oil){
            return res.status(404).json({
                success:false,
                message:`No oil found with id : ${id}`,
                data:null
            });
        }
        return res.status(200).json({
            success:true,
            message:"Oil found",
            data:oil
        })
    } catch (error) {
        res.status(500).json({
            success: false,
            message: `Error finding oil: ${error.message}`,
        })
    }
}

export const deleteOil = async (req , res)=>{
    const id = req.params.id;
    try {
        await Oil.findOneAndDelete({id: id});
        return res.status(200).json({
            success:true,
            message:"Oil deleted",
            data:null
        })

    } catch (error) {
                res.status(404).json({
                success:false,
                message:`No oil found with id : ${id}`,
                data:null
            });
    }
}

export const calculateCapital = async (req, res) => {
    try {
        const oilData = await Oil.find({});

        if (oilData.length === 0) {
            return res.status(404).json({
                success: false,
                message: "No data found",
                data: null
            });
        }
        const totalQuantity = oilData.reduce((sum , oil)=>sum+oil.oil_quantity , 0)
        const totalCapital = oilData.reduce((sum , oil)=>sum+oil.oil_quantity*oil.oil_cost,0)
        res.status(200).json({
            success: true,
            message: "Capital calculated successfully",
            data: {
                quantity:`total quantity is :${totalQuantity} ML`,
                capital:`total capital is : ${totalCapital} JD`
            }
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: `Error calculating capital: ${error.message}`
        });
    }
};
/*
{
  "_id": ObjectId("oil_id"),
  "oil_name": "Oil Name",
  "oil_cost": 5.00,
  "oil_quantity": 50,
  "status": "available",
  "created_at": ISODate("2025-03-04T12:00:00Z"),
  "updated_at": ISODate("2025-03-04T12:05:00Z")
}
*/