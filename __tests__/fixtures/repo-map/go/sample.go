package sample

import "fmt"
import pkg "os"

const PublicConst = 1
const privateConst = 2

type PublicType struct { Name string }
type privateType interface { Run() }

func PublicFunc(value int) int { return value + 1 }
func privateFunc() { fmt.Println(pkg.PathSeparator) }
func (t PublicType) Method() int { return len(t.Name) }
